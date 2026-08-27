import type { CloudCommand } from "./cloudRuntime";

const OUTBOX_KEY = "yange-cloud-command-outbox-v1";

export interface QueuedCloudCommand {
  id: string;
  command: CloudCommand;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

export interface FlushReport {
  delivered: number;
  pending: number;
  error: string | null;
}

type StoragePort = Pick<Storage, "getItem" | "setItem">;

export class CloudCommandOutbox {
  private activeFlush: Promise<FlushReport> | null = null;

  constructor(private readonly storage: StoragePort) {}

  read(): QueuedCloudCommand[] {
    try {
      const parsed = JSON.parse(this.storage.getItem(OUTBOX_KEY) ?? "[]") as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry): entry is QueuedCloudCommand => Boolean(
          entry && typeof entry === "object" && typeof (entry as QueuedCloudCommand).id === "string",
        ))
        .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
    } catch {
      return [];
    }
  }

  private write(queue: QueuedCloudCommand[]): void {
    this.storage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  }

  enqueue(command: CloudCommand): number {
    const operationId = typeof command.input.operationId === "string"
      ? command.input.operationId
      : crypto.randomUUID();
    const queue = this.read();
    if (!queue.some((entry) => entry.id === operationId)) {
      queue.push({ id: operationId, command: structuredClone(command), queuedAt: new Date().toISOString(), attempts: 0, lastError: null });
      this.write(queue);
    }
    return queue.length;
  }

  pendingCount(): number {
    return this.read().length;
  }

  flush(sender: (command: CloudCommand) => Promise<unknown>): Promise<FlushReport> {
    if (this.activeFlush) return this.activeFlush;
    this.activeFlush = this.flushInOrder(sender).finally(() => { this.activeFlush = null; });
    return this.activeFlush;
  }

  private async flushInOrder(sender: (command: CloudCommand) => Promise<unknown>): Promise<FlushReport> {
    let delivered = 0;
    let queue = this.read();
    for (const entry of [...queue]) {
      try {
        await sender(entry.command);
        queue = queue.filter((candidate) => candidate.id !== entry.id);
        this.write(queue);
        delivered += 1;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Cloud sync failed.";
        queue = queue.map((candidate) => candidate.id === entry.id
          ? { ...candidate, attempts: candidate.attempts + 1, lastError: message }
          : candidate);
        this.write(queue);
        return { delivered, pending: queue.length, error: message };
      }
    }
    return { delivered, pending: queue.length, error: null };
  }
}

const memoryFallback = (() => {
  let value: string | null = null;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
})();

export const browserCloudCommandOutbox = new CloudCommandOutbox(
  typeof window === "undefined" ? memoryFallback : window.localStorage,
);
