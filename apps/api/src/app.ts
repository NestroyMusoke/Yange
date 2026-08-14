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
  FakeNotificationGateway,
  ManualForecastAdapter,
  type ForecastProvider,
} from "@yange/contracts";
import { queueGarmentsForLaundry } from "@yange/domain";
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
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
  const notificationGateway = new FakeNotificationGateway(now);

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
      if (url.pathname === "/healthz") {
        sendJson(response, 200, { status: "ok", service: configuration.serviceName });
        finish(200);
        return;
      }
      if (url.pathname === "/readyz") {
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
        sendJson(response, 200, { state: twin.state, ledgerLength: twin.ledger.length });
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
        const workflow = new WearCastWorkflow({
          forecastProvider: dependencies.forecastProvider
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
      const status = message === "REQUEST_TOO_LARGE" ? 413 : message === "REQUEST_BODY_INVALID" ? 400 : 500;
      sendJson(response, status, { error: status === 500 ? "INTERNAL_ERROR" : message });
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
