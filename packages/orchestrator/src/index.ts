import type { ForecastProvider, NotificationGateway } from "@yange/contracts";
import {
  commitWearCastDecision,
  evaluateWearCast,
  markNotificationDelivered,
  type DomainEvent,
  type SevenDayForecast,
  type TwinState,
  type WearCastDecision,
} from "@yange/domain";

export type WorkflowCheckpoint =
  | "triggered"
  | "forecast-acquired"
  | "decision-simulated"
  | "interventions-committed"
  | "notifications-delivered"
  | "completed";

export type WorkflowStatus = "running" | "failed" | "completed";

export interface WorkflowCheckpointEntry {
  checkpoint: WorkflowCheckpoint;
  reachedAt: string;
  detail: string;
}

export interface WorkflowFailure {
  checkpoint: WorkflowCheckpoint;
  message: string;
  failedAt: string;
  retryable: boolean;
}

export interface WearCastExecution {
  runId: string;
  triggerId: string;
  source: "scheduler" | "demo-scheduler";
  triggeredAt: string;
  updatedAt: string;
  status: WorkflowStatus;
  checkpoint: WorkflowCheckpoint;
  attempts: number;
  duplicateTriggerCount: number;
  checkpointHistory: WorkflowCheckpointEntry[];
  forecast: SevenDayForecast | null;
  decision: WearCastDecision | null;
  deliveredNotificationIds: string[];
  failure: WorkflowFailure | null;
}

export interface WorkflowRepository {
  read(triggerId: string): WearCastExecution | null | Promise<WearCastExecution | null>;
  latest(): WearCastExecution | null | Promise<WearCastExecution | null>;
  save(execution: WearCastExecution): void | Promise<void>;
  reset(): void | Promise<void>;
}

export interface TwinSnapshot {
  state: TwinState;
  ledger: DomainEvent[];
}

export interface TwinSnapshotReader {
  read(): TwinSnapshot | Promise<TwinSnapshot>;
}

export interface DomainEventSink {
  append(events: DomainEvent[]): Promise<void>;
}

export interface WearCastTrigger {
  triggerId: string;
  triggeredAt: string;
  source: WearCastExecution["source"];
}

export interface WearCastWorkflowDependencies {
  forecastProvider: ForecastProvider;
  notificationGateway: NotificationGateway;
  repository: WorkflowRepository;
  twinReader: TwinSnapshotReader;
  eventSink: DomainEventSink;
  now?: () => string;
}

const checkpointOrder: WorkflowCheckpoint[] = [
  "triggered",
  "forecast-acquired",
  "decision-simulated",
  "interventions-committed",
  "notifications-delivered",
  "completed",
];

function reached(current: WorkflowCheckpoint, target: WorkflowCheckpoint): boolean {
  return checkpointOrder.indexOf(current) >= checkpointOrder.indexOf(target);
}

function createExecution(trigger: WearCastTrigger, now: string): WearCastExecution {
  return {
    runId: `run-${trigger.triggerId}`,
    triggerId: trigger.triggerId,
    source: trigger.source,
    triggeredAt: trigger.triggeredAt,
    updatedAt: now,
    status: "running",
    checkpoint: "triggered",
    attempts: 1,
    duplicateTriggerCount: 0,
    checkpointHistory: [
      { checkpoint: "triggered", reachedAt: now, detail: "Scheduler trigger accepted." },
    ],
    forecast: null,
    decision: null,
    deliveredNotificationIds: [],
    failure: null,
  };
}

export class WearCastWorkflow {
  private readonly now: () => string;

  constructor(private readonly dependencies: WearCastWorkflowDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  private async save(execution: WearCastExecution): Promise<void> {
    execution.updatedAt = this.now();
    await this.dependencies.repository.save(structuredClone(execution));
  }

  private async advance(
    execution: WearCastExecution,
    checkpoint: WorkflowCheckpoint,
    detail: string,
  ): Promise<void> {
    execution.checkpoint = checkpoint;
    execution.checkpointHistory.push({ checkpoint, reachedAt: this.now(), detail });
    await this.save(execution);
  }

  async run(trigger: WearCastTrigger): Promise<WearCastExecution> {
    const existing = await this.dependencies.repository.read(trigger.triggerId);
    if (existing?.status === "completed") {
      existing.duplicateTriggerCount += 1;
      await this.save(existing);
      return structuredClone(existing);
    }
    const execution = existing ?? createExecution(trigger, this.now());
    if (existing) {
      execution.status = "running";
      execution.failure = null;
      execution.attempts += 1;
      await this.save(execution);
    } else {
      await this.save(execution);
    }

    try {
      if (!reached(execution.checkpoint, "forecast-acquired")) {
        execution.forecast = await this.dependencies.forecastProvider.sevenDay();
        await this.advance(
          execution,
          "forecast-acquired",
          `${execution.forecast.periods.length} forecast periods validated from ${execution.forecast.source}.`,
        );
      }

      if (!reached(execution.checkpoint, "decision-simulated")) {
        if (!execution.forecast) throw new Error("Forecast checkpoint is missing its snapshot.");
        const { state } = await this.dependencies.twinReader.read();
        execution.decision = evaluateWearCast(state, execution.forecast, trigger.triggeredAt);
        await this.advance(
          execution,
          "decision-simulated",
          `${execution.decision.risks.length} outfit risk signal(s) evaluated in two non-destructive branches.`,
        );
      }

      if (!reached(execution.checkpoint, "interventions-committed")) {
        if (!execution.decision) throw new Error("Decision checkpoint is missing its receipt.");
        const { state, ledger } = await this.dependencies.twinReader.read();
        const events = commitWearCastDecision(state, ledger, {
          runId: execution.runId,
          triggerId: execution.triggerId,
          decision: execution.decision,
          operationId: `wearcast:${execution.triggerId}:commit`,
          occurredAt: this.now(),
        });
        await this.dependencies.eventSink.append(events);
        await this.advance(
          execution,
          "interventions-committed",
          `${events.length} idempotent domain event(s) committed through the validated event sink.`,
        );
      }

      if (!reached(execution.checkpoint, "notifications-delivered")) {
        if (!execution.decision) throw new Error("Decision checkpoint is missing its notifications.");
        for (const draft of execution.decision.notifications) {
          if (execution.deliveredNotificationIds.includes(draft.id)) continue;
          const beforeDelivery = await this.dependencies.twinReader.read();
          const notification = beforeDelivery.state.autonomy.notifications[draft.id];
          if (!notification) throw new Error(`Queued notification ${draft.id} is missing.`);
          const delivery = await this.dependencies.notificationGateway.deliver(
            notification,
            `${execution.triggerId}:${notification.id}`,
          );
          const afterGateway = await this.dependencies.twinReader.read();
          const events = markNotificationDelivered(afterGateway.state, afterGateway.ledger, {
            notificationId: notification.id,
            operationId: `wearcast:${execution.triggerId}:delivery:${notification.id}`,
            occurredAt: delivery.deliveredAt,
          });
          await this.dependencies.eventSink.append(events);
          execution.deliveredNotificationIds.push(notification.id);
          await this.save(execution);
        }
        await this.advance(
          execution,
          "notifications-delivered",
          `${execution.deliveredNotificationIds.length} notification(s) delivered with stable idempotency keys.`,
        );
      }

      if (!reached(execution.checkpoint, "completed")) {
        execution.status = "completed";
        await this.advance(execution, "completed", "WearCast workflow completed without unresolved steps.");
      }
      return structuredClone(execution);
    } catch (cause) {
      const nextCheckpoint = checkpointOrder[checkpointOrder.indexOf(execution.checkpoint) + 1] ?? execution.checkpoint;
      execution.status = "failed";
      execution.failure = {
        checkpoint: nextCheckpoint,
        message: cause instanceof Error ? cause.message : "WearCast workflow failed.",
        failedAt: this.now(),
        retryable: true,
      };
      await this.save(execution);
      return structuredClone(execution);
    }
  }
}
