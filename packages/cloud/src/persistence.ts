import {
  createSeedState,
  replayEvents,
  type DomainEvent,
  type TwinState,
} from "@yange/domain";
import type {
  DomainEventSink,
  TwinSnapshot,
  TwinSnapshotReader,
  WearCastExecution,
  WorkflowRepository,
} from "@yange/orchestrator";

export interface OutboxRecord {
  id: string;
  userId: string;
  eventId: string;
  kind: "notification" | "domain-event";
  payload: unknown;
  status: "pending" | "published" | "failed";
  attempts: number;
  createdAt: string;
  publishedAt: string | null;
  lastError: string | null;
}

export interface AppendReceipt {
  appendedEventIds: string[];
  duplicateEventIds: string[];
  projectionVersion: number;
  outboxRecordIds: string[];
}

export interface UserStateStore {
  listUserIds(): Promise<string[]>;
  readTwin(userId: string): Promise<TwinSnapshot>;
  appendEvents(userId: string, events: DomainEvent[]): Promise<AppendReceipt>;
  readWorkflow(userId: string, triggerId: string): Promise<WearCastExecution | null>;
  latestWorkflow(userId: string): Promise<WearCastExecution | null>;
  saveWorkflow(userId: string, execution: WearCastExecution): Promise<void>;
  listOutbox(userId: string, status?: OutboxRecord["status"]): Promise<OutboxRecord[]>;
  markOutboxPublished(userId: string, recordId: string, publishedAt: string): Promise<void>;
  markOutboxFailed(userId: string, recordId: string, error: string): Promise<void>;
  reset(userId: string): Promise<void>;
}

interface MemoryUserState {
  ledger: DomainEvent[];
  projection: TwinState;
  projectionVersion: number;
  workflows: Map<string, WearCastExecution>;
  outbox: Map<string, OutboxRecord>;
}

function createMemoryUserState(): MemoryUserState {
  return {
    ledger: [],
    projection: createSeedState(),
    projectionVersion: 0,
    workflows: new Map(),
    outbox: new Map(),
  };
}

function outboxRecordFor(userId: string, event: DomainEvent): OutboxRecord {
  const notificationEvent = event.type === "NotificationQueued";
  return {
    id: `outbox-${event.id}`,
    userId,
    eventId: event.id,
    kind: notificationEvent ? "notification" : "domain-event",
    payload: structuredClone(event),
    status: "pending",
    attempts: 0,
    createdAt: event.occurredAt,
    publishedAt: null,
    lastError: null,
  };
}

export class InMemoryUserStateStore implements UserStateStore {
  private readonly users = new Map<string, MemoryUserState>();

  async listUserIds(): Promise<string[]> {
    return [...this.users.keys()].sort();
  }

  private user(userId: string): MemoryUserState {
    const existing = this.users.get(userId);
    if (existing) return existing;
    const created = createMemoryUserState();
    this.users.set(userId, created);
    return created;
  }

  async readTwin(userId: string): Promise<TwinSnapshot> {
    const state = this.user(userId);
    return structuredClone({ state: state.projection, ledger: state.ledger });
  }

  async appendEvents(userId: string, events: DomainEvent[]): Promise<AppendReceipt> {
    const state = this.user(userId);
    const existingIds = new Set(state.ledger.map((event) => event.id));
    const unique = events.filter((event) => !existingIds.has(event.id));
    const duplicateEventIds = events
      .filter((event) => existingIds.has(event.id))
      .map((event) => event.id);
    state.ledger.push(...structuredClone(unique));
    state.projection = replayEvents(state.projection, unique);
    state.projectionVersion += unique.length;
    const outboxRecordIds: string[] = [];
    for (const event of unique) {
      const record = outboxRecordFor(userId, event);
      state.outbox.set(record.id, record);
      outboxRecordIds.push(record.id);
    }
    return {
      appendedEventIds: unique.map((event) => event.id),
      duplicateEventIds,
      projectionVersion: state.projectionVersion,
      outboxRecordIds,
    };
  }

  async readWorkflow(userId: string, triggerId: string): Promise<WearCastExecution | null> {
    return structuredClone(this.user(userId).workflows.get(triggerId) ?? null);
  }

  async latestWorkflow(userId: string): Promise<WearCastExecution | null> {
    return structuredClone(
      [...this.user(userId).workflows.values()].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )[0] ?? null,
    );
  }

  async saveWorkflow(userId: string, execution: WearCastExecution): Promise<void> {
    this.user(userId).workflows.set(execution.triggerId, structuredClone(execution));
  }

  async listOutbox(userId: string, status?: OutboxRecord["status"]): Promise<OutboxRecord[]> {
    return structuredClone(
      [...this.user(userId).outbox.values()]
        .filter((record) => !status || record.status === status)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    );
  }

  async markOutboxPublished(userId: string, recordId: string, publishedAt: string): Promise<void> {
    const record = this.user(userId).outbox.get(recordId);
    if (!record) throw new Error(`Outbox record ${recordId} does not exist.`);
    record.status = "published";
    record.publishedAt = publishedAt;
    record.attempts += 1;
    record.lastError = null;
  }

  async markOutboxFailed(userId: string, recordId: string, error: string): Promise<void> {
    const record = this.user(userId).outbox.get(recordId);
    if (!record) throw new Error(`Outbox record ${recordId} does not exist.`);
    record.status = "failed";
    record.attempts += 1;
    record.lastError = error;
  }

  async reset(userId: string): Promise<void> {
    this.users.delete(userId);
  }
}

export function workflowRepositoryFor(
  store: UserStateStore,
  userId: string,
): WorkflowRepository {
  return {
    read: (triggerId) => store.readWorkflow(userId, triggerId),
    latest: () => store.latestWorkflow(userId),
    save: (execution) => store.saveWorkflow(userId, execution),
    reset: () => store.reset(userId),
  };
}

export function twinReaderFor(store: UserStateStore, userId: string): TwinSnapshotReader {
  return { read: () => store.readTwin(userId) };
}

export function eventSinkFor(store: UserStateStore, userId: string): DomainEventSink {
  return { append: async (events) => { await store.appendEvents(userId, events); } };
}
