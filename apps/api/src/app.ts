import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  checkRuntimeConfiguration,
  createStructuredLogger,
  eventSinkFor,
  publicRuntimeConfiguration,
  traceIdFromHeader,
  twinReaderFor,
  workflowRepositoryFor,
  type EventPublisher,
  type PrivateMediaStore,
  type RuntimeConfiguration,
  type StructuredLogger,
  type UserStateStore,
  type WearCastTaskScheduler,
} from "@yange/cloud";
import {
  createKampalaDemoForecast,
  DurableInboxNotificationGateway,
  ManualForecastAdapter,
  type MultimodalAnalyzer,
  type MultimodalRequestV1,
  type OutfitExplanationPort,
  type OutfitExplanationRequestV1,
  type ForecastProvider,
  type CalendarContextProvider,
  type NotificationGateway,
} from "@yange/contracts";
import {
  addGarment,
  activatePersonalWardrobe,
  archiveGarment,
  captureLookDna,
  DomainError,
  markOutfitWorn,
  planOutfit,
  queueGarmentsForLaundry,
  recordConfidence,
  updateStyleProfile,
  updateGarment,
  updateUserProfile,
  type ActivatePersonalWardrobeInput,
  type AddGarmentInput,
  type ArchiveGarmentInput,
  type CaptureLookDnaInput,
  type MarkOutfitWornInput,
  type PlanOutfitInput,
  type QueueLaundryInput,
  type RecordConfidenceInput,
  type UpdateStyleProfileInput,
  type UpdateGarmentInput,
  type UpdateUserProfileInput,
} from "@yange/domain";
import { WearCastWorkflow } from "@yange/orchestrator";
import { resolveSession } from "./session";

const MAX_BODY_BYTES = 64 * 1024;
const DEMO_TRIGGER_ID = "cloud-demo-friday-forecast-2026-08-14";
const LOCAL_SESSION_SECRET = "yange-local-session-secret-not-for-production";

export interface YangeApiDependencies {
  configuration: RuntimeConfiguration;
  store: UserStateStore;
  logger?: StructuredLogger;
  webRoot?: string | null;
  now?: () => string;
  taskScheduler?: WearCastTaskScheduler;
  eventPublisher?: EventPublisher;
  mediaStore?: PrivateMediaStore;
  forecastProvider?: ForecastProvider;
  forecastProviderForLocation?: (location: { latitude: number; longitude: number; label: string }) => ForecastProvider;
  calendarProvider?: CalendarContextProvider;
  notificationGateway?: NotificationGateway;
  multimodalAnalyzerForUser?: (userId: string) => MultimodalAnalyzer;
  outfitExplainer?: OutfitExplanationPort;
}

type CloudCommand =
  | { type: "wear-outfit"; input: MarkOutfitWornInput }
  | { type: "record-confidence"; input: RecordConfidenceInput }
  | { type: "add-garment"; input: AddGarmentInput }
  | { type: "update-garment"; input: UpdateGarmentInput }
  | { type: "archive-garment"; input: ArchiveGarmentInput }
  | { type: "activate-personal-wardrobe"; input: ActivatePersonalWardrobeInput }
  | { type: "update-user-profile"; input: UpdateUserProfileInput }
  | { type: "update-style-profile"; input: UpdateStyleProfileInput }
  | { type: "capture-look-dna"; input: CaptureLookDnaInput }
  | { type: "plan-outfit"; input: PlanOutfitInput }
  | { type: "queue-laundry"; input: QueueLaundryInput };

function parseCloudCommand(body: Record<string, unknown>): CloudCommand {
  if (typeof body.type !== "string" || !body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    throw new Error("REQUEST_BODY_INVALID");
  }
  const allowed = new Set([
    "wear-outfit",
    "record-confidence",
    "add-garment",
    "update-garment",
    "archive-garment",
    "activate-personal-wardrobe",
    "update-user-profile",
    "update-style-profile",
    "capture-look-dna",
    "plan-outfit",
    "queue-laundry",
  ]);
  if (!allowed.has(body.type)) throw new Error("REQUEST_BODY_INVALID");
  const input = body.input as Record<string, unknown>;
  if (
    typeof input.operationId !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,200}$/.test(input.operationId) ||
    typeof input.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(input.occurredAt))
  ) throw new Error("REQUEST_BODY_INVALID");
  if (body.type === "wear-outfit" && (typeof input.outfitId !== "string" || typeof input.wearContext !== "string")) {
    throw new Error("REQUEST_BODY_INVALID");
  }
  if (body.type === "record-confidence" && (
    typeof input.outfitId !== "string" ||
    !Number.isInteger(input.value) ||
    Number(input.value) < 1 ||
    Number(input.value) > 5 ||
    !Array.isArray(input.tags) ||
    input.tags.length > 12 ||
    !input.tags.every((tag) => typeof tag === "string" && tag.length <= 40)
  )) throw new Error("REQUEST_BODY_INVALID");
  if (body.type === "queue-laundry" && (
    !Array.isArray(input.garmentIds) ||
    !input.garmentIds.every((id) => typeof id === "string")
  )) throw new Error("REQUEST_BODY_INVALID");
  if (body.type === "archive-garment" && typeof input.garmentId !== "string") {
    throw new Error("REQUEST_BODY_INVALID");
  }
  const objectPayload = body.type === "add-garment" || body.type === "update-garment"
    ? "garment"
    : body.type === "update-style-profile" || body.type === "update-user-profile"
      ? "profile"
      : body.type === "capture-look-dna"
        ? "look"
        : body.type === "plan-outfit"
          ? "candidate"
          : null;
  if (objectPayload && (!input[objectPayload] || typeof input[objectPayload] !== "object" || Array.isArray(input[objectPayload]))) {
    throw new Error("REQUEST_BODY_INVALID");
  }
  return body as unknown as CloudCommand;
}

function parseMultimodalRequestBody(body: Record<string, unknown>): MultimodalRequestV1 {
  if (
    body.contractVersion !== "1.0" ||
    typeof body.requestId !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,200}$/.test(body.requestId) ||
    (body.mode !== "garment" && body.mode !== "look-dna") ||
    !Array.isArray(body.images) ||
    body.images.length < 1 ||
    body.images.length > 3
  ) throw new Error("REQUEST_BODY_INVALID");
  for (const candidate of body.images) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("REQUEST_BODY_INVALID");
    const image = candidate as Record<string, unknown>;
    if (
      typeof image.assetId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(image.assetId) ||
      !["garment", "care-label", "inspiration"].includes(String(image.kind)) ||
      !["image/jpeg", "image/png", "image/webp"].includes(String(image.mimeType)) ||
      typeof image.fileName !== "string" || image.fileName.length > 180 ||
      !Number.isInteger(image.byteLength) || Number(image.byteLength) < 1 || Number(image.byteLength) > 8 * 1024 * 1024 ||
      !Number.isInteger(image.width) || Number(image.width) < 1 || Number(image.width) > 8_192 ||
      !Number.isInteger(image.height) || Number(image.height) < 1 || Number(image.height) > 8_192
    ) throw new Error("REQUEST_BODY_INVALID");
  }
  return body as unknown as MultimodalRequestV1;
}

function parseExplanationRequestBody(body: Record<string, unknown>): OutfitExplanationRequestV1 {
  if (
    body.contractVersion !== "1.0" ||
    typeof body.requestId !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,200}$/.test(body.requestId) ||
    !body.candidate ||
    typeof body.candidate !== "object" ||
    Array.isArray(body.candidate) ||
    !Array.isArray((body.candidate as Record<string, unknown>).scoreBreakdown)
  ) throw new Error("REQUEST_BODY_INVALID");
  return body as unknown as OutfitExplanationRequestV1;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(encoded),
    "Cache-Control": "no-store",
  });
  response.end(encoded);
}

function requestId(request: IncomingMessage): string {
  const existing = request.headers["x-request-id"];
  return typeof existing === "string" && existing.length <= 128
    ? existing
    : crypto.randomUUID();
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("REQUEST_BODY_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("REQUEST_BODY_INVALID");
  }
  return parsed as Record<string, unknown>;
}

function secureHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.googleapis.com",
  );
}

function allowCors(
  request: IncomingMessage,
  response: ServerResponse,
  configuration: RuntimeConfiguration,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const configured = configuration.allowedOrigin
    ?? (configuration.mode === "local" ? "http://127.0.0.1:4173" : null);
  const allowed = configured === "self" && request.headers.host
    ? `${request.headers["x-forwarded-proto"] ?? "https"}://${request.headers.host}`
    : configured;
  if (origin !== allowed) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return true;
}

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
};

function serveStatic(pathname: string, response: ServerResponse, webRoot: string | null): boolean {
  if (!webRoot || !existsSync(webRoot)) return false;
  const root = resolve(webRoot);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const candidate = resolve(root, normalize(requested));
  const safeCandidate = candidate.startsWith(`${root}\\`) || candidate.startsWith(`${root}/`)
    ? candidate
    : join(root, "index.html");
  const finalPath = existsSync(safeCandidate) && statSync(safeCandidate).isFile()
    ? safeCandidate
    : join(root, "index.html");
  if (!existsSync(finalPath)) return false;
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(finalPath)] ?? "application/octet-stream",
    "Cache-Control": finalPath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  createReadStream(finalPath).pipe(response);
  return true;
}

export function createYangeApi(dependencies: YangeApiDependencies) {
  const { configuration, store } = dependencies;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const logger = dependencies.logger ?? createStructuredLogger(configuration.projectId);
  const configurationCheck = checkRuntimeConfiguration(configuration);
  const notificationGateway = dependencies.notificationGateway ?? new DurableInboxNotificationGateway(now);

  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    secureHeaders(response);
    const startedAt = Date.now();
    const id = requestId(request);
    response.setHeader("X-Request-Id", id);
    const traceId = traceIdFromHeader(
      typeof request.headers["x-cloud-trace-context"] === "string"
        ? request.headers["x-cloud-trace-context"]
        : undefined,
    );
    const url = new URL(request.url ?? "/", "http://yange.local");
    const method = request.method ?? "GET";

    const finish = (status: number, userId?: string) => {
      logger.write(status >= 500 ? "ERROR" : status >= 400 ? "WARNING" : "INFO", "request.completed", {
        requestId: id,
        traceId,
        userId,
        component: "yange-api",
        method,
        path: url.pathname,
        status,
        durationMs: Date.now() - startedAt,
      });
    };

    try {
      if (!allowCors(request, response, configuration)) {
        sendJson(response, 403, { error: "ORIGIN_NOT_ALLOWED" });
        finish(403);
        return;
      }
      if (method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        finish(204);
        return;
      }
      if (url.pathname === "/health" || url.pathname === "/healthz") {
        sendJson(response, 200, { status: "ok", service: configuration.serviceName });
        finish(200);
        return;
      }
      if (url.pathname === "/ready" || url.pathname === "/readyz") {
        const status = configurationCheck.ready ? 200 : 503;
        sendJson(response, status, {
          status: configurationCheck.ready ? "ready" : "not-ready",
          issues: configurationCheck.issues,
        });
        finish(status);
        return;
      }

      if (url.pathname.startsWith("/internal/") && configuration.role === "edge") {
        sendJson(response, 404, { error: "NOT_FOUND" });
        finish(404);
        return;
      }

      if (url.pathname.startsWith("/v1/") && configuration.role === "worker") {
        sendJson(response, 404, { error: "NOT_FOUND" });
        finish(404);
        return;
      }

      if (url.pathname.startsWith("/v1/") && !configurationCheck.ready) {
        sendJson(response, 503, { error: "RUNTIME_NOT_READY", issues: configurationCheck.issues });
        finish(503);
        return;
      }

      const internalUser = url.pathname.startsWith("/internal/")
        && typeof request.headers["x-yange-user"] === "string"
        ? request.headers["x-yange-user"]
        : null;
      const session = internalUser
        ? { userId: internalUser, setCookie: null }
        : resolveSession(
          typeof request.headers.cookie === "string" ? request.headers.cookie : undefined,
          configuration.sessionSecret ?? LOCAL_SESSION_SECRET,
          configuration.environment === "production",
          now,
        );
      if (session.setCookie) response.setHeader("Set-Cookie", session.setCookie);
      const userId = session.userId;

      if (method === "GET" && url.pathname === "/v1/runtime") {
        sendJson(response, 200, {
          sessionPartition: userId,
          configuration: publicRuntimeConfiguration(configuration),
          readiness: configurationCheck,
          architecture: {
            decisionAuthority: "deterministic-domain",
            aiRole: "supervised-proposal-and-explanation",
            persistence: configuration.mode === "google" ? "firestore-transactional" : "memory-transactional",
            media: configuration.mode === "google" ? "private-cloud-storage" : "browser-private",
            asyncTransport: configuration.mode === "google" ? "cloud-tasks-plus-pubsub" : "in-process",
          },
        });
        finish(200, userId);
        return;
      }

      if (method === "GET" && (url.pathname === "/v1/twin" || url.pathname === "/internal/twin")) {
        const twin = await store.readTwin(userId);
        sendJson(response, 200, { state: twin.state, ledger: twin.ledger, ledgerLength: twin.ledger.length });
        finish(200, userId);
        return;
      }

      if (method === "GET" && url.pathname === "/v1/context") {
        const twin = await store.readTwin(userId);
        const profile = twin.state.userProfile;
        const provider = dependencies.forecastProviderForLocation?.({
          latitude: profile.latitude,
          longitude: profile.longitude,
          label: profile.locationLabel,
        }) ?? dependencies.forecastProvider;
        if (!provider) {
          sendJson(response, 501, { error: "LIVE_WEATHER_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const forecast = await provider.sevenDay();
        const requestedAt = url.searchParams.get("at");
        const target = requestedAt && Number.isFinite(Date.parse(requestedAt)) ? Date.parse(requestedAt) : Date.now();
        const period = forecast.periods.find((candidate) => Date.parse(candidate.startsAt) <= target && target < Date.parse(candidate.endsAt))
          ?? forecast.periods.find((candidate) => Date.parse(candidate.startsAt) >= target)
          ?? forecast.periods[0];
        if (!period) throw new Error("LIVE_WEATHER_EMPTY");
        let calendar = null;
        let calendarStatus: "connected" | "not-configured" | "unavailable" = dependencies.calendarProvider ? "connected" : "not-configured";
        if (dependencies.calendarProvider) {
          try {
            calendar = await dependencies.calendarProvider.upcoming();
          } catch {
            calendarStatus = "unavailable";
          }
        }
        sendJson(response, 200, {
          weather: {
            source: forecast.source,
            location: forecast.location,
            observedAt: forecast.issuedAt,
            temperatureC: period.temperatureC,
            precipitationProbability: period.precipitationProbability,
            condition: period.condition,
          },
          forecast,
          calendar,
          calendarStatus,
        });
        finish(200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/v1/commands") {
        const command = parseCloudCommand(await readJson(request));
        const twin = await store.readTwin(userId);
        const events = (() => {
          switch (command.type) {
            case "wear-outfit": return markOutfitWorn(twin.state, twin.ledger, command.input);
            case "record-confidence": return recordConfidence(twin.state, twin.ledger, command.input);
            case "add-garment": return addGarment(twin.state, twin.ledger, command.input);
            case "update-garment": return updateGarment(twin.state, twin.ledger, command.input);
            case "archive-garment": return archiveGarment(twin.state, twin.ledger, command.input);
            case "activate-personal-wardrobe": return activatePersonalWardrobe(twin.state, twin.ledger, command.input);
            case "update-user-profile": return updateUserProfile(twin.ledger, command.input);
            case "update-style-profile": return updateStyleProfile(twin.ledger, command.input);
            case "capture-look-dna": return captureLookDna(twin.state, twin.ledger, command.input);
            case "plan-outfit": return planOutfit(twin.state, twin.ledger, command.input);
            case "queue-laundry": return queueGarmentsForLaundry(twin.state, twin.ledger, command.input);
          }
        })();
        const receipt = await store.appendEvents(userId, events);
        sendJson(response, 200, { events, receipt });
        finish(200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/v1/ai/analyze") {
        if (!dependencies.multimodalAnalyzerForUser) {
          sendJson(response, 501, { error: "MULTIMODAL_AI_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const requestBody = parseMultimodalRequestBody(await readJson(request));
        const result = await dependencies.multimodalAnalyzerForUser(userId).analyze(requestBody);
        sendJson(response, 200, { result });
        finish(200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/v1/ai/explain-outfit") {
        if (!dependencies.outfitExplainer) {
          sendJson(response, 501, { error: "OUTFIT_EXPLAINER_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const requestBody = parseExplanationRequestBody(await readJson(request));
        const result = await dependencies.outfitExplainer.explain(requestBody);
        sendJson(response, 200, { result });
        finish(200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/v1/demo/stage") {
        await readJson(request);
        const twin = await store.readTwin(userId);
        const events = queueGarmentsForLaundry(twin.state, twin.ledger, {
          garmentIds: ["cream-blouse", "chocolate-trousers", "ivory-knit"],
          operationId: "cloud-demo:stage-pressure",
          occurredAt: now(),
        });
        const receipt = await store.appendEvents(userId, events);
        sendJson(response, 200, { receipt });
        finish(200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/v1/media/upload-intent") {
        if (!dependencies.mediaStore) {
          sendJson(response, 501, { error: "CLOUD_MEDIA_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const body = await readJson(request);
        const assetId = typeof body.assetId === "string" ? body.assetId : "";
        const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
        const byteLength = typeof body.byteLength === "number" ? body.byteLength : 0;
        if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") {
          throw new Error("REQUEST_BODY_INVALID");
        }
        const intent = await dependencies.mediaStore.createUploadIntent(
          userId,
          assetId,
          mimeType,
          byteLength,
        );
        sendJson(response, 200, { intent });
        finish(200, userId);
        return;
      }

      if (method === "GET" && url.pathname.startsWith("/v1/media/") && url.pathname.endsWith("/read-url")) {
        if (!dependencies.mediaStore) {
          sendJson(response, 501, { error: "CLOUD_MEDIA_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const assetId = url.pathname.split("/")[3] ?? "";
        sendJson(response, 200, await dependencies.mediaStore.createReadUrl(userId, assetId));
        finish(200, userId);
        return;
      }

      const isWearCastRun = method === "POST"
        && (url.pathname === "/v1/wearcast/run" || url.pathname === "/internal/scheduler/wearcast");
      if (isWearCastRun) {
        const body = await readJson(request);
        const requestedTriggerId = typeof body.triggerId === "string" && body.triggerId.trim()
          ? body.triggerId.trim()
          : DEMO_TRIGGER_ID;
        if (!/^[a-zA-Z0-9_-]{1,160}$/.test(requestedTriggerId)) {
          throw new Error("REQUEST_BODY_INVALID");
        }
        const triggerId = requestedTriggerId;
        const triggeredAt = typeof body.triggeredAt === "string" && Number.isFinite(Date.parse(body.triggeredAt))
          ? body.triggeredAt
          : now();
        if (url.pathname === "/v1/wearcast/run" && dependencies.taskScheduler) {
          const scheduled = await dependencies.taskScheduler.enqueue({ userId, triggerId, triggeredAt });
          sendJson(response, 202, { scheduled });
          finish(202, userId);
          return;
        }
        const workflowTwin = await store.readTwin(userId);
        const profile = workflowTwin.state.userProfile;
        const workflow = new WearCastWorkflow({
          forecastProvider: dependencies.forecastProviderForLocation?.({
            latitude: profile.latitude,
            longitude: profile.longitude,
            label: profile.locationLabel,
          }) ?? dependencies.forecastProvider
            ?? new ManualForecastAdapter(createKampalaDemoForecast(), {
              now: () => new Date(triggeredAt),
            }),
          notificationGateway,
          repository: workflowRepositoryFor(store, userId),
          twinReader: twinReaderFor(store, userId),
          eventSink: eventSinkFor(store, userId),
          now,
        });
        const execution = await workflow.run({
          triggerId,
          triggeredAt,
          source: url.pathname.startsWith("/internal/") ? "scheduler" : "demo-scheduler",
        });
        const outbox = dependencies.eventPublisher
          ? await (await import("@yange/cloud")).dispatchOutbox(
            store,
            userId,
            dependencies.eventPublisher,
            now,
          )
          : null;
        sendJson(response, execution.status === "failed" ? 503 : 200, { execution, outbox });
        finish(execution.status === "failed" ? 503 : 200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/internal/scheduler/sweep") {
        if (!dependencies.taskScheduler) {
          sendJson(response, 501, { error: "TASK_SCHEDULER_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const sweepAt = now();
        const bucket = sweepAt.slice(0, 13).replace(/[^0-9]/g, "");
        const userIds = await store.listUserIds();
        const forwardedProto = typeof request.headers["x-forwarded-proto"] === "string"
          ? request.headers["x-forwarded-proto"]
          : configuration.mode === "google" ? "https" : "http";
        const requestWorkerUrl = request.headers.host
          ? `${forwardedProto}://${request.headers.host}`
          : configuration.workerUrl ?? undefined;
        const scheduled = [];
        for (const partitionUserId of userIds) {
          scheduled.push(await dependencies.taskScheduler.enqueue({
            userId: partitionUserId,
            triggerId: `scheduled-${partitionUserId}-${bucket}`,
            triggeredAt: sweepAt,
            workerUrl: requestWorkerUrl,
          }));
        }
        sendJson(response, 200, { usersScanned: userIds.length, scheduled });
        finish(200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/internal/scheduler/outbox-sweep") {
        if (!dependencies.eventPublisher) {
          sendJson(response, 501, { error: "EVENT_PUBLISHER_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const { dispatchOutbox } = await import("@yange/cloud");
        const userIds = await store.listUserIds();
        const receipts = [];
        for (const partitionUserId of userIds) {
          receipts.push({
            userId: partitionUserId,
            receipt: await dispatchOutbox(store, partitionUserId, dependencies.eventPublisher, now),
          });
        }
        sendJson(response, 200, { usersScanned: userIds.length, receipts });
        finish(200, userId);
        return;
      }

      if (method === "POST" && url.pathname === "/internal/outbox/dispatch") {
        if (!dependencies.eventPublisher) {
          sendJson(response, 501, { error: "EVENT_PUBLISHER_NOT_CONFIGURED" });
          finish(501, userId);
          return;
        }
        const { dispatchOutbox } = await import("@yange/cloud");
        const receipt = await dispatchOutbox(store, userId, dependencies.eventPublisher, now);
        sendJson(response, receipt.failed ? 503 : 200, { receipt });
        finish(receipt.failed ? 503 : 200, userId);
        return;
      }

      if (method === "GET" && url.pathname === "/v1/outbox") {
        sendJson(response, 200, { records: await store.listOutbox(userId) });
        finish(200, userId);
        return;
      }

      if (method === "GET" && url.pathname === "/v1/workflows/latest") {
        sendJson(response, 200, { execution: await store.latestWorkflow(userId) });
        finish(200, userId);
        return;
      }

      if (method === "DELETE" && url.pathname === "/v1/demo") {
        await store.reset(userId);
        sendJson(response, 200, { reset: true });
        finish(200, userId);
        return;
      }

      if (method === "GET" && serveStatic(url.pathname, response, dependencies.webRoot ?? null)) {
        finish(200, userId);
        return;
      }

      sendJson(response, 404, { error: "NOT_FOUND" });
      finish(404, userId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "UNKNOWN_ERROR";
      const invalidMedia = message === "Stored media failed binary signature validation."
        || message === "Stored media exceeds Yange's 8 MiB safety limit."
        || message === "Stored media has an unsupported content type.";
      const status = message === "REQUEST_TOO_LARGE"
        ? 413
        : message === "REQUEST_BODY_INVALID"
          ? 400
          : invalidMedia
            ? 422
          : cause instanceof DomainError
            ? 422
            : 500;
      sendJson(response, status, { error: status === 500 ? "INTERNAL_ERROR" : invalidMedia ? "MEDIA_UPLOAD_INVALID" : message });
      logger.write("ERROR", "request.failed", {
        requestId: id,
        traceId,
        component: "yange-api",
        path: url.pathname,
        error: message,
      });
      finish(status);
    }
  };
}
