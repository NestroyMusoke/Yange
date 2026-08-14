import { describe, expect, it } from "vitest";
import {
  createKampalaDemoForecast,
  FakeNotificationGateway,
  ManualForecastAdapter,
} from "@yange/contracts";
import {
  createSeedState,
  queueGarmentsForLaundry,
  replayEvents,
  type DomainEvent,
  type TwinState,
} from "@yange/domain";
import {
  WearCastWorkflow,
  type WearCastExecution,
  type WorkflowRepository,
} from "./index";

class MemoryWorkflowRepository implements WorkflowRepository {
  private readonly values = new Map<string, WearCastExecution>();
  read(triggerId: string) { return structuredClone(this.values.get(triggerId) ?? null); }
  latest() { return structuredClone([...this.values.values()].at(-1) ?? null); }
  save(execution: WearCastExecution) { this.values.set(execution.triggerId, structuredClone(execution)); }
  reset() { this.values.clear(); }
}

function stagedTwin(): { state: TwinState; ledger: DomainEvent[] } {
  const seed = createSeedState();
  const ledger = queueGarmentsForLaundry(seed, [], {
    garmentIds: ["cream-blouse", "chocolate-trousers", "ivory-knit"],
    operationId: "stage",
    occurredAt: "2026-08-14T07:25:00.000Z",
  });
  return { state: replayEvents(seed, ledger), ledger };
}

describe("checkpointed WearCast workflow", () => {
  it("resumes notification delivery without duplicate events, then ignores a duplicate trigger", async () => {
    let twin = stagedTwin();
    const repository = new MemoryWorkflowRepository();
    const gateway = new FakeNotificationGateway(() => "2026-08-14T07:32:00.000Z");
    gateway.failNext();
    const workflow = new WearCastWorkflow({
      forecastProvider: new ManualForecastAdapter(createKampalaDemoForecast(), {
        now: () => new Date("2026-08-14T07:30:00.000Z"),
      }),
      notificationGateway: gateway,
      repository,
      twinReader: { read: () => structuredClone(twin) },
      eventSink: {
        append: async (events) => {
          twin = { ledger: [...twin.ledger, ...events], state: replayEvents(twin.state, events) };
        },
      },
      now: () => "2026-08-14T07:31:00.000Z",
    });
    const trigger = {
      triggerId: "demo-friday-forecast-2026-08-14",
      triggeredAt: "2026-08-14T07:30:00.000Z",
      source: "demo-scheduler" as const,
    };

    const failed = await workflow.run(trigger);
    const committedLength = twin.ledger.length;
    expect(failed.status).toBe("failed");
    expect(failed.checkpoint).toBe("interventions-committed");
    expect(failed.failure?.checkpoint).toBe("notifications-delivered");
    expect(twin.state.autonomy.runs[failed.runId]).toBeDefined();

    const resumed = await workflow.run(trigger);
    expect(resumed.status).toBe("completed");
    expect(resumed.attempts).toBe(2);
    expect(resumed.deliveredNotificationIds).toHaveLength(resumed.decision?.notifications.length ?? 0);
    expect(twin.ledger.length).toBeGreaterThan(committedLength);
    const completedLength = twin.ledger.length;
    const deliveryCount = gateway.deliveryCount();

    const duplicate = await workflow.run(trigger);
    expect(duplicate.duplicateTriggerCount).toBe(1);
    expect(twin.ledger).toHaveLength(completedLength);
    expect(gateway.deliveryCount()).toBe(deliveryCount);
  });
});
