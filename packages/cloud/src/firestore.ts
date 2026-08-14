import { Firestore, type DocumentData } from "@google-cloud/firestore";
import {
  createSeedState,
  replayEvents,
  type DomainEvent,
  type TwinState,
} from "@yange/domain";
import type { TwinSnapshot, WearCastExecution } from "@yange/orchestrator";
import type {
  AppendReceipt,
  OutboxRecord,
  UserStateStore,
} from "./persistence";

interface ProjectionDocument {
  state: TwinState;
  version: number;
  updatedAt: string;
}

function assertPartitionId(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(value)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
}

function assertDocumentId(value: string, label: string): void {
  if (!value || value.length > 500 || value.includes("/") || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
}

function eventOutboxRecord(userId: string, event: DomainEvent): OutboxRecord {
  return {
    id: `outbox-${event.id}`,
    userId,
    eventId: event.id,
    kind: event.type === "NotificationQueued" ? "notification" : "domain-event",
    payload: structuredClone(event),
    status: "pending",
    attempts: 0,
    createdAt: event.occurredAt,
    publishedAt: null,
    lastError: null,
  };
}

export class FirestoreUserStateStore implements UserStateStore {
  constructor(private readonly firestore: Firestore) {}

  async listUserIds(): Promise<string[]> {
    const snapshot = await this.firestore.collection("users").select().get();
    return snapshot.docs.map((document) => document.id).sort();
  }

  private user(userId: string) {
    assertPartitionId(userId, "User ID");
    return this.firestore.collection("users").doc(userId);
  }

  async readTwin(userId: string): Promise<TwinSnapshot> {
    const user = this.user(userId);
    const [projectionSnapshot, ledgerSnapshot] = await Promise.all([
      user.collection("projections").doc("current").get(),
      user.collection("events").orderBy("sequence", "asc").get(),
    ]);
    const ledger = ledgerSnapshot.docs.map((document) => document.data().event as DomainEvent);
    if (!projectionSnapshot.exists) {
      return { state: createSeedState(), ledger };
    }
    const projection = projectionSnapshot.data() as ProjectionDocument;
    return { state: structuredClone(projection.state), ledger: structuredClone(ledger) };
  }

  async appendEvents(userId: string, events: DomainEvent[]): Promise<AppendReceipt> {
    if (events.length > 100) throw new Error("A single append cannot exceed 100 domain events.");
    const user = this.user(userId);
    const projectionRef = user.collection("projections").doc("current");
    const eventRefs = events.map((event) => user.collection("events").doc(event.id));

    return this.firestore.runTransaction(async (transaction) => {
      const [projectionSnapshot, ...eventSnapshots] = await Promise.all([
        transaction.get(projectionRef),
        ...eventRefs.map((reference) => transaction.get(reference)),
      ]);
      const existing = projectionSnapshot.exists
        ? projectionSnapshot.data() as ProjectionDocument
        : { state: createSeedState(), version: 0, updatedAt: new Date(0).toISOString() };
      const unique = events.filter((_, index) => !eventSnapshots[index]?.exists);
      const duplicateEventIds = events
        .filter((_, index) => eventSnapshots[index]?.exists)
        .map((event) => event.id);
      const appendedEventIds: string[] = [];
      const outboxRecordIds: string[] = [];

      unique.forEach((event, uniqueIndex) => {
        const originalIndex = events.findIndex((candidate) => candidate.id === event.id);
        const eventRef = eventRefs[originalIndex];
        if (!eventRef) throw new Error("Event reference alignment failed.");
        transaction.create(eventRef, {
          event: structuredClone(event),
          sequence: existing.version + uniqueIndex + 1,
          occurredAt: event.occurredAt,
          operationId: event.operationId,
          type: event.type,
        });
        const outbox = eventOutboxRecord(userId, event);
        transaction.create(user.collection("outbox").doc(outbox.id), outbox);
        appendedEventIds.push(event.id);
        outboxRecordIds.push(outbox.id);
      });

      if (unique.length) {
        transaction.set(user, { updatedAt: unique.at(-1)?.occurredAt, schemaVersion: 1 }, { merge: true });
        transaction.set(projectionRef, {
          state: replayEvents(existing.state, unique),
          version: existing.version + unique.length,
          updatedAt: unique.at(-1)?.occurredAt ?? existing.updatedAt,
        } satisfies ProjectionDocument);
      }

      return {
        appendedEventIds,
        duplicateEventIds,
        projectionVersion: existing.version + unique.length,
        outboxRecordIds,
      };
    });
  }

  async readWorkflow(userId: string, triggerId: string): Promise<WearCastExecution | null> {
    assertPartitionId(triggerId, "Trigger ID");
    const snapshot = await this.user(userId).collection("workflows").doc(triggerId).get();
    return snapshot.exists ? structuredClone(snapshot.data() as WearCastExecution) : null;
  }

  async latestWorkflow(userId: string): Promise<WearCastExecution | null> {
    const snapshot = await this.user(userId)
      .collection("workflows")
      .orderBy("updatedAt", "desc")
      .limit(1)
      .get();
    return snapshot.empty ? null : structuredClone(snapshot.docs[0]?.data() as WearCastExecution);
  }

  async saveWorkflow(userId: string, execution: WearCastExecution): Promise<void> {
    assertPartitionId(execution.triggerId, "Trigger ID");
    const user = this.user(userId);
    const batch = this.firestore.batch();
    batch.set(user, { updatedAt: execution.updatedAt, schemaVersion: 1 }, { merge: true });
    batch.set(
      user.collection("workflows").doc(execution.triggerId),
      structuredClone(execution) as unknown as DocumentData,
    );
    await batch.commit();
  }

  async listOutbox(userId: string, status?: OutboxRecord["status"]): Promise<OutboxRecord[]> {
    const snapshot = await this.user(userId).collection("outbox").orderBy("createdAt", "asc").get();
    return snapshot.docs
      .map((document) => document.data() as OutboxRecord)
      .filter((record) => !status || record.status === status)
      .map((record) => structuredClone(record));
  }

  async markOutboxPublished(userId: string, recordId: string, publishedAt: string): Promise<void> {
    await this.updateOutbox(userId, recordId, {
      status: "published",
      publishedAt,
      lastError: null,
    });
  }

  async markOutboxFailed(userId: string, recordId: string, error: string): Promise<void> {
    await this.updateOutbox(userId, recordId, {
      status: "failed",
      lastError: error.slice(0, 500),
    });
  }

  private async updateOutbox(
    userId: string,
    recordId: string,
    update: Partial<OutboxRecord>,
  ): Promise<void> {
    assertDocumentId(recordId, "Outbox record ID");
    const reference = this.user(userId).collection("outbox").doc(recordId);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new Error(`Outbox record ${recordId} does not exist.`);
      const current = snapshot.data() as OutboxRecord;
      transaction.update(reference, { ...update, attempts: current.attempts + 1 });
    });
  }

  async reset(userId: string): Promise<void> {
    await this.firestore.recursiveDelete(this.user(userId));
  }
}

export function createFirestoreStore(projectId: string, databaseId = "(default)") {
  return new FirestoreUserStateStore(new Firestore({ projectId, databaseId }));
}
