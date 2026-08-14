import { describe, expect, it } from "vitest";
import { queueGarmentsForLaundry } from "@yange/domain";
import {
  dispatchOutbox,
  type EventPublisher,
} from "./messaging";
import { InMemoryUserStateStore } from "./persistence";

describe("transactional outbox dispatch", () => {
  it("records a failed publish and safely retries the same outbox identity", async () => {
    const store = new InMemoryUserStateStore();
    const twin = await store.readTwin("user-a");
    const events = queueGarmentsForLaundry(twin.state, twin.ledger, {
      garmentIds: ["cream-blouse"],
      operationId: "outbox-test",
      occurredAt: "2026-08-14T08:00:00.000Z",
    });
    await store.appendEvents("user-a", events);
    let fail = true;
    const publisher: EventPublisher = {
      async publish(record) {
        if (fail) throw new Error("Temporary Pub/Sub outage");
        return { messageId: `message-${record.id}` };
      },
    };

    const failed = await dispatchOutbox(store, "user-a", publisher);
    fail = false;
    const recovered = await dispatchOutbox(store, "user-a", publisher);
    const records = await store.listOutbox("user-a");

    expect(failed.failed).toBe(events.length);
    expect(recovered.published).toBe(events.length);
    expect(records.every((record) => record.status === "published" && record.attempts === 2)).toBe(true);
  });
});
