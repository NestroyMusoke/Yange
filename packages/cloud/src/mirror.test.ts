import { describe, expect, it } from "vitest";
import {
  MIRROR_CONTRACT_VERSION,
  type CreateMirrorJobRequestV1,
} from "@yange/contracts";
import type { MediaUploadIntent, PrivateMediaStore } from "./media";
import {
  GoogleVirtualTryOnGenerator,
  InMemoryMirrorJobRepository,
  createMirrorJob,
  runMirrorJob,
} from "./mirror";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function request(id = "request-1"): CreateMirrorJobRequestV1 {
  return {
    contractVersion: MIRROR_CONTRACT_VERSION,
    requestId: id,
    outfitCandidateId: "candidate-1",
    personImage: {
      assetId: `mirror-person-${id}`,
      mimeType: "image/jpeg",
      byteLength: 500,
      width: 900,
      height: 1_400,
    },
    garment: {
      garmentId: "garment-1",
      assetId: "asset-garment-1",
      name: "Cream blouse",
      category: "top",
    },
    consent: {
      adultConfirmed: true,
      imageRightsConfirmed: true,
      privateProcessingAccepted: true,
      retention: "delete-person-after-generation",
      acceptedAt: "2026-08-29T10:00:00.000Z",
    },
    requestedAt: "2026-08-29T10:00:00.000Z",
  };
}

class MemoryMedia implements PrivateMediaStore {
  readonly persistent = new Map<string, Buffer>();
  readonly temporary = new Map<string, Buffer>();

  async createUploadIntent(): Promise<MediaUploadIntent> { throw new Error("Unused."); }
  async createReadUrl(): Promise<{ url: string; expiresAt: string }> { throw new Error("Unused."); }
  async readBytes(_userId: string, assetId: string) {
    const value = this.persistent.get(assetId);
    if (!value) throw new Error("Persistent input not found.");
    return value;
  }
  async delete(_userId: string, assetId: string) { this.persistent.delete(assetId); }
  async createTemporaryUploadIntent(): Promise<MediaUploadIntent> { throw new Error("Unused."); }
  async createTemporaryReadUrl(): Promise<{ url: string; expiresAt: string }> { throw new Error("Unused."); }
  async readTemporaryBytes(_userId: string, assetId: string) {
    const value = this.temporary.get(assetId);
    if (!value) throw new Error("Temporary input not found.");
    return value;
  }
  async writeTemporary(_userId: string, assetId: string, bytes: Buffer, _mimeType: "image/jpeg" | "image/png") {
    this.temporary.set(assetId, bytes);
  }
  async deleteTemporary(_userId: string, assetId: string) { this.temporary.delete(assetId); }
}

describe("Yange Mirror cloud boundary", () => {
  it("runs independently, stores one private result, and deletes the person image", async () => {
    const jobs = new InMemoryMirrorJobRepository();
    const media = new MemoryMedia();
    const proposed = createMirrorJob("user-1", request(), "europe-west1");
    await jobs.createOrReuse("user-1", proposed);
    media.temporary.set(proposed.personAssetId, png);
    media.persistent.set(proposed.garment.assetId, png);

    const completed = await runMirrorJob({ userId: "user-1", jobId: proposed.id }, {
      jobs,
      media,
      generator: { async generate() { return { bytes: png, mimeType: "image/png" }; } },
      now: () => "2026-08-29T10:01:00.000Z",
    });

    expect(completed.status).toBe("ready");
    expect(completed.attempts).toBe(1);
    expect(completed.personDeletedAt).toBe("2026-08-29T10:01:00.000Z");
    expect(media.temporary.has(proposed.personAssetId)).toBe(false);
    expect(media.temporary.get(completed.resultAssetId ?? "")).toEqual(png);
  });

  it("blocks safely, deletes the person image, and never creates a result", async () => {
    const jobs = new InMemoryMirrorJobRepository();
    const media = new MemoryMedia();
    const proposed = createMirrorJob("user-1", request("blocked"), "europe-west1");
    await jobs.createOrReuse("user-1", proposed);
    media.temporary.set(proposed.personAssetId, png);
    media.persistent.set(proposed.garment.assetId, png);

    const completed = await runMirrorJob({ userId: "user-1", jobId: proposed.id }, {
      jobs,
      media,
      generator: { async generate() { throw new Error("Person generation safety blocked."); } },
      now: () => "2026-08-29T10:01:00.000Z",
    });

    expect(completed.status).toBe("blocked");
    expect(completed.failure?.code).toBe("SAFETY_BLOCKED");
    expect(completed.resultAssetId).toBeNull();
    expect(media.temporary.has(proposed.personAssetId)).toBe(false);
  });

  it("enforces the adult-only, one-output Google request policy", async () => {
    let requestBody: Record<string, unknown> | null = null;
    const generator = new GoogleVirtualTryOnGenerator({
      projectId: "yange-test",
      location: "europe-west1",
      tokenProvider: { async accessToken() { return "token"; } },
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          predictions: [{ mimeType: "image/png", bytesBase64Encoded: png.toString("base64") }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const output = await generator.generate({ personBytes: png, garmentBytes: png });
    expect(output.bytes).toEqual(png);
    expect(requestBody).toMatchObject({
      parameters: {
        sampleCount: 1,
        personGeneration: "allow_adult",
        safetySetting: "block_medium_and_above",
        addWatermark: true,
      },
    });
  });

  it("applies the daily cost cap before storing a fifth job", async () => {
    const jobs = new InMemoryMirrorJobRepository();
    for (let index = 0; index < 4; index += 1) {
      const created = await jobs.createOrReuse(
        "user-1",
        createMirrorJob("user-1", request(`quota-${index}`), "europe-west1"),
        4,
      );
      expect(created.rateLimited).toBe(false);
    }
    const fifth = await jobs.createOrReuse(
      "user-1",
      createMirrorJob("user-1", request("quota-5"), "europe-west1"),
      4,
    );
    expect(fifth.rateLimited).toBe(true);
  });

  it("keeps the private person image for bounded transient retries, then deletes it", async () => {
    const jobs = new InMemoryMirrorJobRepository();
    const media = new MemoryMedia();
    const proposed = createMirrorJob("user-1", request("retry"), "europe-west1");
    await jobs.createOrReuse("user-1", proposed);
    media.temporary.set(proposed.personAssetId, png);
    media.persistent.set(proposed.garment.assetId, png);
    const dependencies = {
      jobs,
      media,
      generator: { async generate(): Promise<never> { throw new Error("Virtual Try-On request failed with 503"); } },
      now: () => "2026-08-29T10:01:00.000Z",
    };

    const first = await runMirrorJob({ userId: "user-1", jobId: proposed.id }, dependencies);
    expect(first.status).toBe("queued");
    expect(first.attempts).toBe(1);
    expect(media.temporary.has(proposed.personAssetId)).toBe(true);

    await runMirrorJob({ userId: "user-1", jobId: proposed.id }, dependencies);
    const terminal = await runMirrorJob({ userId: "user-1", jobId: proposed.id }, dependencies);
    expect(terminal.status).toBe("failed");
    expect(terminal.attempts).toBe(3);
    expect(terminal.failure?.code).toBe("MODEL_UNAVAILABLE");
    expect(media.temporary.has(proposed.personAssetId)).toBe(false);
  });

  it("never resurrects a deleted job or leaves a result behind after a deletion race", async () => {
    const jobs = new InMemoryMirrorJobRepository();
    const media = new MemoryMedia();
    const proposed = createMirrorJob("user-1", request("delete-race"), "europe-west1");
    await jobs.createOrReuse("user-1", proposed);
    media.temporary.set(proposed.personAssetId, png);
    media.persistent.set(proposed.garment.assetId, png);

    const completed = await runMirrorJob({ userId: "user-1", jobId: proposed.id }, {
      jobs,
      media,
      generator: {
        async generate() {
          await jobs.update("user-1", proposed.id, {
            status: "deleted",
            updatedAt: "2026-08-29T10:00:30.000Z",
            completedAt: "2026-08-29T10:00:30.000Z",
          });
          return { bytes: png, mimeType: "image/png" as const };
        },
      },
      now: () => "2026-08-29T10:01:00.000Z",
    });

    expect(completed.status).toBe("deleted");
    expect(media.temporary.has(`mirror-result-${proposed.id}`)).toBe(false);
  });
});
