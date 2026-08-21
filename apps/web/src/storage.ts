import type { DomainEvent } from "@yange/domain";

const LEDGER_KEY = "yange.event-ledger.v1";
const LEGACY_LEDGER_KEYS = [
  "yange.phase1.event-ledger",
  "closetloop.phase1.event-ledger",
] as const;

export interface EventRepository {
  read(): DomainEvent[];
  append(events: DomainEvent[]): DomainEvent[];
  replace(events: DomainEvent[]): DomainEvent[];
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

    for (const legacyKey of LEGACY_LEDGER_KEYS) {
      const legacy = window.localStorage.getItem(legacyKey);
      if (!legacy) continue;
      window.localStorage.setItem(LEDGER_KEY, legacy);
      window.localStorage.removeItem(legacyKey);
      return safelyParse(legacy);
    }
    return [];
  },
  append(events) {
    const current = this.read();
    const existingIds = new Set(current.map((event) => event.id));
    const uniqueEvents = events.filter((event) => !existingIds.has(event.id));
    const next = [...current, ...uniqueEvents];
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(next));
    return next;
  },
  replace(events) {
    const unique = [...new Map(events.map((event) => [event.id, event])).values()];
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(unique));
    return unique;
  },
  reset() {
    window.localStorage.removeItem(LEDGER_KEY);
    LEGACY_LEDGER_KEYS.forEach((key) => window.localStorage.removeItem(key));
  },
};
