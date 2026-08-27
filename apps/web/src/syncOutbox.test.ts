import { describe, expect, it, vi } from "vitest";
import { CloudCommandOutbox } from "./syncOutbox";

function memoryStorage() {
  let value: string | null = null;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}

describe("cloud command outbox", () => {
  it("preserves order, stops on failure and retries idempotently", async () => {
    const outbox = new CloudCommandOutbox(memoryStorage());
    outbox.enqueue({ type: "archive-garment", input: { garmentId: "a", operationId: "one", occurredAt: "2026-08-27T09:00:00.000Z" } });
    outbox.enqueue({ type: "archive-garment", input: { garmentId: "b", operationId: "two", occurredAt: "2026-08-27T09:01:00.000Z" } });
    let fail = true;
    const sender = vi.fn(async () => { if (fail) { fail = false; throw new Error("offline"); } });
    expect(await outbox.flush(sender)).toMatchObject({ delivered: 0, pending: 2, error: "offline" });
    expect(await outbox.flush(sender)).toMatchObject({ delivered: 2, pending: 0, error: null });
    expect(sender).toHaveBeenCalledTimes(3);
  });

  it("deduplicates by operation id", () => {
    const outbox = new CloudCommandOutbox(memoryStorage());
    const command = { type: "activate-personal-wardrobe" as const, input: { operationId: "same", occurredAt: "2026-08-27T09:00:00.000Z" } };
    outbox.enqueue(command);
    outbox.enqueue(command);
    expect(outbox.pendingCount()).toBe(1);
  });
});
