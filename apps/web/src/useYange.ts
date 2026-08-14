import { useMemo, useState } from "react";
import {
  calculateReadiness,
  createSeedState,
  deriveActivity,
  markOutfitWorn,
  recordConfidence,
  replayEvents,
  type DomainEvent,
} from "@yange/domain";
import { localEventRepository } from "./storage";

function operationId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useYange() {
  const [ledger, setLedger] = useState<DomainEvent[]>(() =>
    localEventRepository.read(),
  );
  const [error, setError] = useState<string | null>(null);

  const state = useMemo(
    () => replayEvents(createSeedState(), ledger),
    [ledger],
  );
  const readiness = useMemo(() => calculateReadiness(state), [state]);
  const activity = useMemo(
    () => deriveActivity(ledger, state),
    [ledger, state],
  );

  function commit(events: DomainEvent[]) {
    if (!events.length) return;
    setLedger(localEventRepository.append(events));
    setError(null);
  }

  function wearOutfit(outfitId: string) {
    try {
      commit(
        markOutfitWorn(state, ledger, {
          outfitId,
          wearContext: "normal",
          operationId: operationId("wear"),
          occurredAt: new Date().toISOString(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to mark outfit worn.");
    }
  }

  function checkIn(
    outfitId: string,
    value: 1 | 2 | 3 | 4 | 5,
    tags: string[] = [],
  ) {
    try {
      commit(
        recordConfidence(state, ledger, {
          outfitId,
          value,
          tags,
          operationId: operationId("confidence"),
          occurredAt: new Date().toISOString(),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save confidence.");
    }
  }

  function reset() {
    localEventRepository.reset();
    setLedger([]);
    setError(null);
  }

  return {
    state,
    ledger,
    readiness,
    activity,
    error,
    wearOutfit,
    checkIn,
    reset,
  };
}
