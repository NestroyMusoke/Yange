import type { DomainEvent } from "@yange/domain";

const LEDGER_KEY = "yange.phase1.event-ledger";
const LEGACY_LEDGER_KEY = "closetloop.phase1.event-ledger";

export interface EventRepository {
  read(): DomainEvent[];
  append(events: DomainEvent[]): DomainEvent[];
  reset(): void;
}

function safelyParse(value: string | null): DomainEvent[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as DomainEvent[]) : [];
  } catch {
    return [];
  }
}

export const localEventRepository: EventRepository = {
  read() {
    const current = window.localStorage.getItem(LEDGER_KEY);
    if (current) return safelyParse(current);

    const legacy = window.localStorage.getItem(LEGACY_LEDGER_KEY);
    if (!legacy) return [];

    window.localStorage.setItem(LEDGER_KEY, legacy);
    window.localStorage.removeItem(LEGACY_LEDGER_KEY);
    return safelyParse(legacy);
  },
  append(events) {
    const current = this.read();
    const existingIds = new Set(current.map((event) => event.id));
    const uniqueEvents = events.filter((event) => !existingIds.has(event.id));
    const next = [...current, ...uniqueEvents];
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(next));
    return next;
  },
  reset() {
    window.localStorage.removeItem(LEDGER_KEY);
    window.localStorage.removeItem(LEGACY_LEDGER_KEY);
  },
};
