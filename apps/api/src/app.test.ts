import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryUserStateStore,
  InMemoryMirrorJobRepository,
  readRuntimeConfiguration,
  type MediaUploadIntent,
  type MirrorTaskScheduler,
  type PrivateMediaStore,
  type StructuredLogger,
} from "@yange/cloud";
import { createKampalaDemoForecast, ManualForecastAdapter } from "@yange/contracts";
import { createSeedState, type DomainEvent } from "@yange/domain";
import { createYangeApi, type YangeApiDependencies } from "./app";

const silentLogger: StructuredLogger = { write() {} };
let server: Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

async function start(
  environment: Record<string, string> = { NODE_ENV: "test" },
  overrides: Partial<Omit<YangeApiDependencies, "configuration" | "store">> = {},
  store = new InMemoryUserStateStore(),
) {
  server = createServer(createYangeApi({
    configuration: readRuntimeConfiguration(environment),
    store,
    logger: silentLogger,
    now: () => "2026-08-14T07:30:00.000Z",
    ...overrides,
  }));
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  return `http://127.0.0.1:${address.port}`;
}

class MirrorTestMedia implements PrivateMediaStore {
  deleted: string[] = [];
  async createUploadIntent(): Promise<MediaUploadIntent> { throw new Error("Unused."); }
  async createReadUrl(): Promise<{ url: string; expiresAt: string }> { throw new Error("Unused."); }
  async readBytes() { return Buffer.from("persistent"); }
  async delete() {}
  async createTemporaryUploadIntent(_userId: string, assetId: string): Promise<MediaUploadIntent> {
    return {
      assetId,
      objectKey: `temporary/${assetId}`,
      uploadUrl: "https://upload.example/person",
      expiresAt: "2026-08-29T10:10:00.000Z",
      requiredHeaders: { "Content-Type": "image/jpeg" },
    };
  }
  async createTemporaryReadUrl(): Promise<{ url: string; expiresAt: string }> { throw new Error("Unused."); }
  async readTemporaryBytes() { return Buffer.from("temporary"); }
  async writeTemporary() {}
  async deleteTemporary(_userId: string, assetId: string) { this.deleted.push(assetId); }
}

describe("Yange production API", () => {
  it("exposes Cloud Run safe health and readiness endpoints", async () => {
    const origin = await start();
    const health = await fetch(`${origin}/health`);
    const readiness = await fetch(`${origin}/ready`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toEqual({ status: "ready", issues: [] });
    expect(health.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(health.headers.get("cross-origin-embedder-policy")).toBe("credentialless");
    expect(health.headers.get("origin-agent-cluster")).toBe("?1");
  });

  it("reports sanitized local runtime readiness without credentials", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/v1/runtime`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.configuration.mode).toBe("local");
    expect(body.readiness.ready).toBe(true);
    expect(body.configuration).not.toHaveProperty("sessionSecret");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("executes and replays the complete cloud-shaped WearCast workflow idempotently", async () => {
    const origin = await start();
    const stage = await fetch(`${origin}/v1/demo/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const cookie = stage.headers.get("set-cookie")?.split(";")[0];
    expect(stage.status).toBe(200);
    if (!cookie) throw new Error("Session cookie missing.");
    const run = () => fetch(`${origin}/v1/wearcast/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ triggerId: "integration-trigger", triggeredAt: "2026-08-14T07:30:00.000Z" }),
    });
    const first = await run();
    const firstBody = await first.json();
    const duplicate = await run();
    const duplicateBody = await duplicate.json();
    expect(first.status).toBe(200);
    expect(firstBody.execution.status).toBe("completed");
    expect(firstBody.execution.checkpointHistory).toHaveLength(6);
    expect(duplicateBody.execution.duplicateTriggerCount).toBe(1);
    const outbox = await fetch(`${origin}/v1/outbox`, { headers: { Cookie: cookie } });
    const outboxBody = await outbox.json();
    expect(outboxBody.records.length).toBeGreaterThan(3);
  });

  it("fails closed on cross-origin browser requests", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/v1/runtime`, {
      headers: { Origin: "https://attacker.example" },
    });
    expect(response.status).toBe(403);
  });

  it("rejects malformed workflow identities before they reach persistence", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/v1/wearcast/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerId: "../../another-partition" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "REQUEST_BODY_INVALID" });
  });

  it("turns incompatible stored image bytes into an actionable client error", async () => {
    const origin = await start({ NODE_ENV: "test" }, {
      multimodalAnalyzerForUser: () => ({
        async analyze() {
          throw new Error("Stored media failed binary signature validation.");
        },
      }),
    });
    const response = await fetch(`${origin}/v1/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractVersion: "1.0",
        requestId: "safari-fallback-test",
        mode: "garment",
        images: [{
          assetId: "asset-safari",
          kind: "garment",
          fileName: "shirt.webp",
          mimeType: "image/webp",
          byteLength: 1200,
          width: 800,
          height: 1200,
        }],
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "MEDIA_UPLOAD_INVALID" });
  });

  it("revalidates wardrobe commands, persists exact colour evidence, and deduplicates retries", async () => {
    const origin = await start();
    const firstTwin = await fetch(`${origin}/v1/twin`);
    const cookie = firstTwin.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Session cookie missing.");
    const command = (type: string, input: Record<string, unknown>) => fetch(`${origin}/v1/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ type, input }),
    });
    const wornInput = {
      outfitId: "today-city-calm",
      wearContext: "normal",
      operationId: "api-test-wear",
      occurredAt: "2026-08-14T07:30:00.000Z",
    };
    expect((await command("wear-outfit", wornInput)).status).toBe(200);
    const confidenceInput = {
      outfitId: "today-city-calm",
      value: 5,
      tags: ["loved-colour"],
      operationId: "api-test-confidence",
      occurredAt: "2026-08-14T18:30:00.000Z",
    };
    const confidence = await command("record-confidence", confidenceInput);
    const confidenceBody = await confidence.json();
    expect(confidence.status).toBe(200);
    expect(confidenceBody.events.some((event: { type: string }) => event.type === "ColourEvidenceRecorded")).toBe(true);
    const duplicate = await command("record-confidence", confidenceInput);
    expect((await duplicate.json()).events).toEqual([]);
    const twin = await fetch(`${origin}/v1/twin`, { headers: { Cookie: cookie } });
    const twinBody = await twin.json();
    expect(twinBody.ledger.some((event: { type: string }) => event.type === "ColourEvidenceRecorded")).toBe(true);
    const invalid = await command("record-confidence", { ...confidenceInput, operationId: "bad-rating", value: 99 });
    expect(invalid.status).toBe(400);
  });

  it("uses the saved wardrobe location for live weather and degrades Calendar independently", async () => {
    let requestedLocation: { latitude: number; longitude: number; label: string } | null = null;
    const origin = await start({ NODE_ENV: "test" }, {
      forecastProviderForLocation: (location) => {
        requestedLocation = location;
        return new ManualForecastAdapter(createKampalaDemoForecast(), {
          now: () => new Date("2026-08-14T07:30:00.000Z"),
        });
      },
      calendarProvider: {
        async upcoming() {
          throw new Error("Calendar has not been shared yet.");
        },
      },
    });
    const firstTwin = await fetch(`${origin}/v1/twin`);
    const cookie = firstTwin.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Session cookie missing.");
    const profile = {
      version: 1,
      displayName: "Amina",
      locationLabel: "Jinja",
      latitude: 0.4479,
      longitude: 33.2026,
      onboardingCompletedAt: "2026-08-14T07:30:00.000Z",
    };
    const saved = await fetch(`${origin}/v1/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        type: "update-user-profile",
        input: {
          profile,
          operationId: "api-test-profile",
          occurredAt: "2026-08-14T07:30:00.000Z",
        },
      }),
    });
    expect(saved.status).toBe(200);

    const context = await fetch(`${origin}/v1/context?at=2026-08-15T08:30:00.000Z`, {
      headers: { Cookie: cookie },
    });
    const body = await context.json();
    expect(context.status).toBe(200);
    expect(requestedLocation).toEqual({ latitude: 0.4479, longitude: 33.2026, label: "Jinja" });
    expect(body.weather).toMatchObject({ temperatureC: 27, precipitationProbability: 20 });
    expect(body.calendar).toBeNull();
    expect(body.calendarStatus).toBe("unavailable");
  });

  it("keeps public routes off a private worker role", async () => {
    const origin = await start({
      NODE_ENV: "test",
      YANGE_RUNTIME: "google",
      YANGE_ROLE: "worker",
      GOOGLE_CLOUD_PROJECT: "test-project",
      YANGE_TASK_INVOKER_SERVICE_ACCOUNT: "task@test-project.iam.gserviceaccount.com",
    });
    const publicResponse = await fetch(`${origin}/v1/runtime`);
    const internalResponse = await fetch(`${origin}/internal/twin`, {
      headers: { "X-Yange-User": "user-test" },
    });
    expect(publicResponse.status).toBe(404);
    expect(internalResponse.status).toBe(200);
  });

  it("queues an adult-consented Mirror job without exposing its cache key", async () => {
    const store = new InMemoryUserStateStore();
    const media = new MirrorTestMedia();
    const jobs = new InMemoryMirrorJobRepository();
    const queued: Array<{ userId: string; jobId: string }> = [];
    const scheduler: MirrorTaskScheduler = {
      async enqueue(request) {
        queued.push(request);
        return { taskName: `tasks/${request.jobId}`, deduplicated: false };
      },
    };
    const origin = await start(
      { NODE_ENV: "test", YANGE_MIRROR_ENABLED: "true" },
      { mediaStore: media, mirrorJobs: jobs, mirrorTaskScheduler: scheduler },
      store,
    );
    const runtime = await fetch(`${origin}/v1/runtime`);
    const runtimeBody = await runtime.json();
    const cookie = runtime.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Session cookie missing.");
    const userId = runtimeBody.sessionPartition as string;
    const seed = createSeedState();
    const garment = {
      ...seed.garments["cream-blouse"],
      imageAssetId: "asset-personal-cream",
      source: "user-added" as const,
    };
    const baseOutfit = seed.outfits["today-city-calm"];
    if (!baseOutfit) throw new Error("Seed outfit missing.");
    await store.appendEvents(userId, [
      {
        id: "mirror-garment-update",
        operationId: "mirror-fixture",
        occurredAt: "2026-08-29T10:00:00.000Z",
        type: "GarmentUpdated",
        payload: { garment },
      },
      {
        id: "mirror-outfit-plan",
        operationId: "mirror-fixture",
        occurredAt: "2026-08-29T10:00:00.000Z",
        type: "OutfitPlanned",
        payload: {
          outfit: {
            ...baseOutfit,
            id: "planned-candidate-1",
            source: "agent-planned",
            garmentIds: [garment.id],
            dependencies: [garment.id],
          },
        },
      },
    ] as DomainEvent[]);

    const response = await fetch(`${origin}/v1/mirror/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        contractVersion: "1.0",
        requestId: "request-1",
        outfitCandidateId: "candidate-1",
        personImage: {
          assetId: "mirror-person-request-1",
          mimeType: "image/jpeg",
          byteLength: 400_000,
          width: 900,
          height: 1_400,
        },
        garment: {
          garmentId: garment.id,
          assetId: garment.imageAssetId,
          name: garment.name,
          category: garment.category,
        },
        consent: {
          adultConfirmed: true,
          imageRightsConfirmed: true,
          privateProcessingAccepted: true,
          retention: "delete-person-after-generation",
          acceptedAt: "2026-08-29T10:00:00.000Z",
        },
        requestedAt: "2026-08-29T10:00:00.000Z",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body.job).toMatchObject({ status: "queued", model: "virtual-try-on-001" });
    expect(body.job).not.toHaveProperty("cacheKey");
    expect(queued).toEqual([{ userId, jobId: "mirror-request-1" }]);
  });
});
