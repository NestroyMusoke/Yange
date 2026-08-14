import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryUserStateStore,
  readRuntimeConfiguration,
  type StructuredLogger,
} from "@yange/cloud";
import { createYangeApi } from "./app";

const silentLogger: StructuredLogger = { write() {} };
let server: Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

async function start(environment: Record<string, string> = { NODE_ENV: "test" }) {
  server = createServer(createYangeApi({
    configuration: readRuntimeConfiguration(environment),
    store: new InMemoryUserStateStore(),
    logger: silentLogger,
    now: () => "2026-08-14T07:30:00.000Z",
  }));
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  return `http://127.0.0.1:${address.port}`;
}

describe("Yange production API", () => {
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
});
