import { PubSub } from "@google-cloud/pubsub";
import { CloudTasksClient, protos } from "@google-cloud/tasks";
import type { UserStateStore } from "./persistence";

export interface EventPublisher {
  publish(record: {
    id: string;
    userId: string;
    eventId: string;
    kind: string;
    payload: unknown;
  }): Promise<{ messageId: string }>;
}

export interface OutboxDispatchReceipt {
  attempted: number;
  published: number;
  failed: number;
  messageIds: string[];
}

export async function dispatchOutbox(
  store: UserStateStore,
  userId: string,
  publisher: EventPublisher,
  now: () => string = () => new Date().toISOString(),
  limit = 50,
): Promise<OutboxDispatchReceipt> {
  const records = (await store.listOutbox(userId))
    .filter((record) => record.status !== "published")
    .slice(0, Math.max(1, Math.min(limit, 100)));
  const receipt: OutboxDispatchReceipt = {
    attempted: records.length,
    published: 0,
    failed: 0,
    messageIds: [],
  };
  for (const record of records) {
    try {
      const result = await publisher.publish(record);
      await store.markOutboxPublished(userId, record.id, now());
      receipt.published += 1;
      receipt.messageIds.push(result.messageId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown publisher failure.";
      await store.markOutboxFailed(userId, record.id, message);
      receipt.failed += 1;
    }
  }
  return receipt;
}

export class GooglePubSubEventPublisher implements EventPublisher {
  private readonly topic;

  constructor(pubsub: PubSub, topicName: string) {
    this.topic = pubsub.topic(topicName, { messageOrdering: true });
  }

  async publish(record: Parameters<EventPublisher["publish"]>[0]): Promise<{ messageId: string }> {
    const messageId = await this.topic.publishMessage({
      data: Buffer.from(JSON.stringify(record.payload)),
      orderingKey: record.userId,
      attributes: {
        outboxId: record.id,
        eventId: record.eventId,
        kind: record.kind,
        userId: record.userId,
      },
    });
    return { messageId };
  }
}

export interface WearCastTaskRequest {
  userId: string;
  triggerId: string;
  triggeredAt: string;
  workerUrl?: string;
}

export interface WearCastTaskScheduler {
  enqueue(request: WearCastTaskRequest): Promise<{ taskName: string; deduplicated: boolean }>;
}

function taskId(triggerId: string, userId: string): string {
  const normalized = `${userId}-${triggerId}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 400);
  if (!normalized) throw new Error("Trigger did not produce a valid task ID.");
  return normalized;
}

export class GoogleCloudTasksWearCastScheduler implements WearCastTaskScheduler {
  constructor(
    private readonly client: CloudTasksClient,
    private readonly options: {
      projectId: string;
      location: string;
      queue: string;
      workerUrl?: string;
      serviceAccountEmail: string;
    },
  ) {}

  async enqueue(request: WearCastTaskRequest): Promise<{ taskName: string; deduplicated: boolean }> {
    const workerUrl = request.workerUrl ?? this.options.workerUrl;
    if (!workerUrl?.startsWith("https://") && !workerUrl?.startsWith("http://")) {
      throw new Error("A valid worker URL is required to enqueue WearCast.");
    }
    const parent = this.client.queuePath(
      this.options.projectId,
      this.options.location,
      this.options.queue,
    );
    const name = `${parent}/tasks/${taskId(request.triggerId, request.userId)}`;
    const task: protos.google.cloud.tasks.v2.ITask = {
      name,
      httpRequest: {
        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
        url: `${workerUrl.replace(/\/$/, "")}/internal/scheduler/wearcast`,
        headers: { "Content-Type": "application/json", "X-Yange-User": request.userId },
        body: Buffer.from(JSON.stringify(request)),
        oidcToken: {
          serviceAccountEmail: this.options.serviceAccountEmail,
          audience: workerUrl,
        },
      },
    };
    try {
      const [created] = await this.client.createTask({ parent, task });
      return { taskName: created.name ?? name, deduplicated: false };
    } catch (cause) {
      const code = (cause as { code?: number }).code;
      if (code === 6) return { taskName: name, deduplicated: true };
      throw cause;
    }
  }
}

export function createGoogleEventPublisher(projectId: string, topicName: string) {
  return new GooglePubSubEventPublisher(new PubSub({ projectId }), topicName);
}

export function createGoogleTaskScheduler(options: ConstructorParameters<typeof GoogleCloudTasksWearCastScheduler>[1]) {
  return new GoogleCloudTasksWearCastScheduler(new CloudTasksClient(), options);
}
