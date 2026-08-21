import { useEffect, useMemo, useRef, useState } from "react";
import {
  createKampalaDemoForecast,
  FakeNotificationGateway,
  ManualForecastAdapter,
} from "@yange/contracts";
import {
  addGarment as addGarmentCommand,
  calculateReadiness,
  captureLookDna as captureLookDnaCommand,
  createSeedState,
  deriveActivity,
  evaluateWearCast,
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
import { WearCastWorkflow, type WearCastExecution } from "@yange/orchestrator";
import { localWorkflowRepository } from "./autonomyStorage";
import { localEventRepository } from "./storage";
import { indexedDbMediaRepository } from "./media/mediaRepository";
import {
  getCloudTwin,
  isCloudSyncConfigured,
  resetCloudDemo,
  sendCloudCommand,
  type CloudCommand,
} from "./cloudRuntime";

function operationId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

const wearCastTrigger = {
  triggerId: "demo-friday-forecast-2026-08-14",
  triggeredAt: "2026-08-14T07:30:00.000Z",
  source: "demo-scheduler" as const,
};

const demoForecast = createKampalaDemoForecast();

export function useYange() {
  const [ledger, setLedger] = useState<DomainEvent[]>(() =>
    localEventRepository.read(),
  );
  const [error, setError] = useState<string | null>(null);
  const [autonomyExecution, setAutonomyExecution] = useState<WearCastExecution | null>(() =>
    localWorkflowRepository.latest(),
  );
  const [autonomyRunning, setAutonomyRunning] = useState(false);

  useEffect(() => {
    if (!isCloudSyncConfigured()) return;
    let cancelled = false;
    void getCloudTwin().then((cloudTwin) => {
      if (cancelled || (!cloudTwin.ledger.length && ledgerRef.current.length)) return;
      const next = localEventRepository.replace(cloudTwin.ledger);
      ledgerRef.current = next;
      stateRef.current = replayEvents(createSeedState(), next);
      setLedger(next);
    }).catch(() => {
      // Local-first operation remains available if the cloud runtime is temporarily unreachable.
    });
    return () => { cancelled = true; };
  }, []);

  const state = useMemo(
    () => replayEvents(createSeedState(), ledger),
    [ledger],
  );
  const readiness = useMemo(() => calculateReadiness(state), [state]);
  const activity = useMemo(
    () => deriveActivity(ledger, state),
    [ledger, state],
  );
  const ledgerRef = useRef(ledger);
  const stateRef = useRef(state);
  ledgerRef.current = ledger;
  stateRef.current = state;
  const notificationGateway = useMemo(
    () => new FakeNotificationGateway(() => "2026-08-14T07:32:00.000Z"),
    [],
  );
  const forecastProvider = useMemo(
    () => new ManualForecastAdapter(demoForecast, {
      now: () => new Date(wearCastTrigger.triggeredAt),
    }),
    [],
  );
  const wearCastWorkflow = useMemo(
    () => new WearCastWorkflow({
      forecastProvider,
      notificationGateway,
      repository: localWorkflowRepository,
      twinReader: {
        read: () => ({
          state: structuredClone(stateRef.current),
          ledger: structuredClone(ledgerRef.current),
        }),
      },
      eventSink: {
        append: async (events) => {
          if (!events.length) return;
          const next = localEventRepository.append(events);
          ledgerRef.current = next;
          stateRef.current = replayEvents(createSeedState(), next);
          setLedger(next);
          setError(null);
        },
      },
      now: () => "2026-08-14T07:31:00.000Z",
    }),
    [forecastProvider, notificationGateway],
  );
  const wearCastDecision = useMemo(
    () => autonomyExecution?.decision ?? evaluateWearCast(state, demoForecast, wearCastTrigger.triggeredAt),
    [autonomyExecution?.decision, state],
  );

  function commit(events: DomainEvent[]) {
    if (!events.length) return;
    const next = localEventRepository.append(events);
    ledgerRef.current = next;
    stateRef.current = replayEvents(createSeedState(), next);
    setLedger(next);
    setError(null);
  }

  function mirror(command: CloudCommand): void {
    if (!isCloudSyncConfigured()) return;
    void sendCloudCommand(command).catch(() => {
      setError("Saved on this device. Cloud memory is temporarily unavailable.");
    });
  }

  function wearOutfit(outfitId: string) {
    try {
      const input = {
        outfitId,
        wearContext: "normal",
        operationId: operationId("wear"),
        occurredAt: new Date().toISOString(),
      };
      commit(markOutfitWorn(state, ledger, input));
      mirror({ type: "wear-outfit", input });
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
      const input = {
        outfitId,
        value,
        tags,
        operationId: operationId("confidence"),
        occurredAt: new Date().toISOString(),
      };
      commit(recordConfidence(state, ledger, input));
      mirror({ type: "record-confidence", input });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save confidence.");
    }
  }

  function reset() {
    localEventRepository.reset();
    setLedger([]);
    ledgerRef.current = [];
    stateRef.current = createSeedState();
    localWorkflowRepository.reset();
    notificationGateway.reset();
    setAutonomyExecution(null);
    setError(null);
    void indexedDbMediaRepository.clear().catch(() => {
      setError("The event ledger was reset, but some private image data could not be cleared.");
    });
    if (isCloudSyncConfigured()) void resetCloudDemo().catch(() => undefined);
  }

  function addWardrobeItem(garment: Garment): boolean {
    try {
      const input = { garment, operationId: operationId("garment"), occurredAt: new Date().toISOString() };
      commit(addGarmentCommand(state, ledger, input));
      mirror({ type: "add-garment", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add garment.");
      return false;
    }
  }

  function saveStyleProfile(profile: StyleProfile): boolean {
    try {
      const input = { profile, operationId: operationId("style-profile"), occurredAt: new Date().toISOString() };
      commit(updateStyleProfileCommand(ledger, input));
      mirror({ type: "update-style-profile", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save Style DNA.");
      return false;
    }
  }

  function saveLookDna(look: LookDna): boolean {
    try {
      const input = { look, operationId: operationId("look-dna"), occurredAt: new Date().toISOString() };
      commit(captureLookDnaCommand(state, ledger, input));
      mirror({ type: "capture-look-dna", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save Look DNA.");
      return false;
    }
  }

  function planCandidate(candidate: OutfitCandidate): boolean {
    try {
      const input = { candidate, operationId: operationId("plan-outfit"), occurredAt: new Date().toISOString() };
      commit(planOutfitCommand(state, ledger, input));
      mirror({ type: "plan-outfit", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reserve this outfit.");
      return false;
    }
  }

  function queueLaundry(garmentIds: string[]): boolean {
    try {
      const input = { garmentIds, operationId: operationId("queue-laundry"), occurredAt: new Date().toISOString() };
      commit(queueGarmentsForLaundryCommand(state, ledger, input));
      mirror({ type: "queue-laundry", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the laundry basket.");
      return false;
    }
  }

  function stageWearCastPressure(): boolean {
    return queueLaundry(["cream-blouse", "chocolate-trousers", "ivory-knit"]);
  }

  async function runWearCast(injectNotificationFailure = false): Promise<WearCastExecution> {
    setAutonomyRunning(true);
    setError(null);
    if (injectNotificationFailure) notificationGateway.failNext();
    try {
      const execution = await wearCastWorkflow.run(wearCastTrigger);
      setAutonomyExecution(execution);
      return execution;
    } finally {
      setAutonomyRunning(false);
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
    wearCastDecision,
    wearCastForecast: demoForecast,
    autonomyExecution,
    autonomyRunning,
    stageWearCastPressure,
    runWearCast,
    reset,
  };
}
