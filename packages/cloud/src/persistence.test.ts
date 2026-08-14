import { describe, expect, it } from "vitest";
import { queueGarmentsForLaundry } from "@yange/domain";
import { InMemoryUserStateStore } from "./persistence";

describe("local production-shaped state store", () => {
  it("atomically advances ledger, projection, and outbox while deduplicating events", async () => {
    const store = new InMemoryUserStateStore();
    const before = await store.readTwin("user-a");
    const events = queueGarmentsForLaundry(before.state, before.ledger, {
      garmentIds: ["cream-blouse"],
      operationId: "cloud-local-test",
      occurredAt: "2026-08-14T08:00:00.000Z",
    });

    const first = await store.appendEvents("user-a", events);
    const duplicate = await store.appendEvents("user-a", events);
    const after = await store.readTwin("user-a");
    const outbox = await store.listOutbox("user-a");

    expect(first.appendedEventIds).toHaveLength(events.length);
    expect(first.projectionVersion).toBe(events.length);
    expect(duplicate.appendedEventIds).toHaveLength(0);
    expect(duplicate.duplicateEventIds).toHaveLength(events.length);
    expect(after.state.garments["cream-blouse"].state).toBe("laundry");
    expect(outbox).toHaveLength(events.length);
  });

  it("isolates user partitions", async () => {
    const store = new InMemoryUserStateStore();
    const userA = await store.readTwin("user-a");
    const events = queueGarmentsForLaundry(userA.state, [], {
      garmentIds: ["cream-blouse"],
      operationId: "partition-test",
      occurredAt: "2026-08-14T08:00:00.000Z",
    });
    await store.appendEvents("user-a", events);
    expect((await store.readTwin("user-b")).ledger).toHaveLength(0);
  });
});
