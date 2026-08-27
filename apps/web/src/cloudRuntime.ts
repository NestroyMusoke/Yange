import type { WearCastExecution } from "@yange/orchestrator";
import type { CalendarSnapshot, DomainEvent, SevenDayForecast, TwinState, WeatherSnapshot } from "@yange/domain";
import type {
  MultimodalRequestV1,
  MultimodalResponseV1,
  OutfitExplanationRequestV1,
  OutfitExplanationV1,
} from "@yange/contracts";

export interface CloudRuntimeSnapshot {
  sessionPartition: string;
  configuration: {
    mode: "local" | "google";
    role: "all" | "edge" | "worker";
    environment: string;
    serviceName: string;
    projectId: string | null;
    location: string;
    taskLocation: string;
    geminiModel: string;
    geminiMultimodalModel: string;
    mediaBucketConfigured: boolean;
    workerConfigured: boolean;
    taskInvokerConfigured: boolean;
    weatherConfigured: boolean;
    calendarConfigured: boolean;
  };
  readiness: { ready: boolean; issues: string[] };
  architecture: {
    decisionAuthority: string;
    aiRole: string;
    persistence: string;
    media: string;
    asyncTransport: string;
  };
}

interface RunResponse {
  execution?: WearCastExecution;
  scheduled?: { taskName: string; deduplicated: boolean };
  outbox?: { attempted: number; published: number; failed: number } | null;
}

export interface CloudCommand {
  type:
    | "wear-outfit"
    | "record-confidence"
    | "add-garment"
    | "update-garment"
    | "archive-garment"
    | "activate-personal-wardrobe"
    | "update-user-profile"
    | "update-style-profile"
    | "capture-look-dna"
    | "plan-outfit"
    | "queue-laundry";
  input: Record<string, unknown>;
}

export function isCloudSyncConfigured(): boolean {
  return Boolean(import.meta.env.VITE_YANGE_API_BASE_URL) || !import.meta.env.DEV;
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_YANGE_API_BASE_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  return import.meta.env.DEV ? "http://127.0.0.1:8080" : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Yange runtime returned ${response.status}.`);
  return body;
}

export function probeCloudRuntime(): Promise<CloudRuntimeSnapshot> {
  return request<CloudRuntimeSnapshot>("/v1/runtime");
}

export async function getCloudTwin(): Promise<{ state: TwinState; ledger: DomainEvent[] }> {
  return request<{ state: TwinState; ledger: DomainEvent[] }>("/v1/twin");
}

export interface LiveContextSnapshot {
  weather: WeatherSnapshot;
  forecast: SevenDayForecast;
  calendar: CalendarSnapshot | null;
  calendarStatus: "connected" | "not-configured" | "unavailable";
}

export function getLiveContext(at?: string): Promise<LiveContextSnapshot> {
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  return request<LiveContextSnapshot>(`/v1/context${query}`);
}

export function sendCloudCommand(command: CloudCommand): Promise<{
  events: DomainEvent[];
  receipt: { appendedEventIds: string[]; duplicateEventIds: string[] };
}> {
  return request("/v1/commands", {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export async function createMediaUploadIntent(asset: {
  assetId: string;
  mimeType: string;
  byteLength: number;
}): Promise<{
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
}> {
  const response = await request<{ intent: { uploadUrl: string; requiredHeaders: Record<string, string> } }>(
    "/v1/media/upload-intent",
    { method: "POST", body: JSON.stringify(asset) },
  );
  return response.intent;
}

export async function createMediaReadUrl(assetId: string): Promise<{ url: string; expiresAt: string }> {
  return request<{ url: string; expiresAt: string }>(`/v1/media/${encodeURIComponent(assetId)}`);
}

export async function analyzeWithCloud(requestBody: MultimodalRequestV1): Promise<MultimodalResponseV1> {
  const response = await request<{ result: MultimodalResponseV1 }>("/v1/ai/analyze", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
  return response.result;
}

export async function explainWithCloud(requestBody: OutfitExplanationRequestV1): Promise<OutfitExplanationV1> {
  const response = await request<{ result: OutfitExplanationV1 }>("/v1/ai/explain-outfit", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
  return response.result;
}

export async function stageCloudDemo(): Promise<void> {
  await request("/v1/demo/stage", { method: "POST", body: "{}" });
}

export function runCloudWearCast(trigger: { triggerId: string; triggeredAt: string }): Promise<RunResponse> {
  return request<RunResponse>("/v1/wearcast/run", {
    method: "POST",
    body: JSON.stringify(trigger),
  });
}

export async function getLatestCloudExecution(): Promise<WearCastExecution | null> {
  const response = await request<{ execution: WearCastExecution | null }>("/v1/workflows/latest");
  return response.execution;
}

export async function waitForCloudExecution(
  triggerId?: string,
  attempts = 15,
  delayMs = 1_000,
): Promise<WearCastExecution | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const execution = await getLatestCloudExecution();
    if ((!triggerId || execution?.triggerId === triggerId) && (execution?.status === "completed" || execution?.status === "failed")) {
      return execution;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

export async function resetCloudDemo(): Promise<void> {
  await request("/v1/demo", { method: "DELETE" });
}
