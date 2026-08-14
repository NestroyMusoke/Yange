import { useMemo, useState } from "react";
import {
  addGarment as addGarmentCommand,
  calculateReadiness,
  captureLookDna as captureLookDnaCommand,
  createSeedState,
  deriveActivity,
  markOutfitWorn,
  planOutfit as planOutfitCommand,
  queueGarmentsForLaundry as queueGarmentsForLaundryCommand,
  recordConfidence,
  replayEvents,
  updateStyleProfile as updateStyleProfileCommand,
  type DomainEvent,
  type Garment,
  type LookDna,
  type OutfitCandidate,
  type StyleProfile,
} from "@yange/domain";
import { localEventRepository } from "./storage";
import { indexedDbMediaRepository } from "./media/mediaRepository";

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
    void indexedDbMediaRepository.clear().catch(() => {
      setError("The event ledger was reset, but some private image data could not be cleared.");
    });
  }

  function addWardrobeItem(garment: Garment): boolean {
    try {
      commit(
        addGarmentCommand(state, ledger, {
          garment,
          operationId: operationId("garment"),
          occurredAt: new Date().toISOString(),
        }),
      );
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add garment.");
      return false;
    }
  }

  function saveStyleProfile(profile: StyleProfile): boolean {
    try {
      commit(
        updateStyleProfileCommand(ledger, {
          profile,
          operationId: operationId("style-profile"),
          occurredAt: new Date().toISOString(),
        }),
      );
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save Style DNA.");
      return false;
    }
  }

  function saveLookDna(look: LookDna): boolean {
    try {
      commit(
        captureLookDnaCommand(state, ledger, {
          look,
          operationId: operationId("look-dna"),
          occurredAt: new Date().toISOString(),
        }),
      );
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save Look DNA.");
      return false;
    }
  }

  function planCandidate(candidate: OutfitCandidate): boolean {
    try {
      commit(
        planOutfitCommand(state, ledger, {
          candidate,
          operationId: operationId("plan-outfit"),
          occurredAt: new Date().toISOString(),
        }),
      );
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reserve this outfit.");
      return false;
    }
  }

  function queueLaundry(garmentIds: string[]): boolean {
    try {
      commit(
        queueGarmentsForLaundryCommand(state, ledger, {
          garmentIds,
          operationId: operationId("queue-laundry"),
          occurredAt: new Date().toISOString(),
        }),
      );
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the laundry basket.");
      return false;
    }
  }

  return {
    state,
    ledger,
    readiness,
    activity,
    error,
    wearOutfit,
    checkIn,
    addWardrobeItem,
    saveStyleProfile,
    saveLookDna,
    planCandidate,
    queueLaundry,
    reset,
  };
}
