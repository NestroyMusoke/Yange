import type { WearCastExecution } from "@yange/orchestrator";

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

export async function stageCloudDemo(): Promise<void> {
  await request("/v1/demo/stage", { method: "POST", body: "{}" });
}

export function runCloudWearCast(): Promise<RunResponse> {
  return request<RunResponse>("/v1/wearcast/run", {
    method: "POST",
    body: JSON.stringify({
      triggerId: "cloud-proof-friday-2026-08-14",
      triggeredAt: "2026-08-14T07:30:00.000Z",
    }),
  });
}

export async function getLatestCloudExecution(): Promise<WearCastExecution | null> {
  const response = await request<{ execution: WearCastExecution | null }>("/v1/workflows/latest");
  return response.execution;
}

export async function waitForCloudExecution(
  attempts = 15,
  delayMs = 1_000,
): Promise<WearCastExecution | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const execution = await getLatestCloudExecution();
    if (execution?.status === "completed" || execution?.status === "failed") {
      return execution;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

export async function resetCloudDemo(): Promise<void> {
  await request("/v1/demo", { method: "DELETE" });
}
