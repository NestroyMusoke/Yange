import { useEffect, useMemo, useRef, useState } from "react";
import {
  createKampalaDemoForecast,
  FakeNotificationGateway,
  ManualForecastAdapter,
} from "@yange/contracts";
import {
  addGarment as addGarmentCommand,
  activatePersonalWardrobe as activatePersonalWardrobeCommand,
  archiveGarment as archiveGarmentCommand,
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
  updateGarment as updateGarmentCommand,
  updateUserProfile as updateUserProfileCommand,
  type DomainEvent,
  type Garment,
  type LookDna,
  type OutfitCandidate,
  type SevenDayForecast,
  type StyleProfile,
  type UserProfile,
} from "@yange/domain";
import { WearCastWorkflow, type WearCastExecution } from "@yange/orchestrator";
import { localWorkflowRepository } from "./autonomyStorage";
import { localEventRepository } from "./storage";
import { indexedDbMediaRepository } from "./media/mediaRepository";
import { browserCloudCommandOutbox, type FlushReport } from "./syncOutbox";
import {
  browserNotificationState,
  requestBrowserNotifications,
  showUnseenWardrobeNotifications,
  type BrowserNotificationState,
} from "./notificationRuntime";
import {
  getCloudTwin,
  getLiveContext,
  isCloudSyncConfigured,
  resetCloudDemo,
  runCloudWearCast,
  sendCloudCommand,
  waitForCloudExecution,
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
  const [liveForecast, setLiveForecast] = useState<SevenDayForecast>(demoForecast);
  const [browserNotifications, setBrowserNotifications] = useState<BrowserNotificationState>(browserNotificationState);
  const [syncState, setSyncState] = useState<{
    status: "local" | "syncing" | "synced" | "waiting";
    pending: number;
  }>(() => ({
    status: isCloudSyncConfigured() ? (browserCloudCommandOutbox.pendingCount() ? "waiting" : "synced") : "local",
    pending: browserCloudCommandOutbox.pendingCount(),
  }));

  async function flushCloudMirror(): Promise<FlushReport> {
    if (!isCloudSyncConfigured()) return { delivered: 0, pending: 0, error: null };
    const pending = browserCloudCommandOutbox.pendingCount();
    if (!pending) {
      setSyncState({ status: "synced", pending: 0 });
      return { delivered: 0, pending: 0, error: null };
    }
    setSyncState({ status: "syncing", pending });
    const report = await browserCloudCommandOutbox.flush(sendCloudCommand);
    setSyncState({ status: report.pending ? "waiting" : "synced", pending: report.pending });
    if (report.error) setError("Saved on this device. Yange will retry cloud sync when the connection returns.");
    return report;
  }

  useEffect(() => {
    if (!isCloudSyncConfigured()) return;
    let cancelled = false;
    const synchronize = async () => {
      const flush = await flushCloudMirror();
      if (cancelled || flush.pending) return;
      const cloudTwin = await getCloudTwin();
      if (cancelled || (!cloudTwin.ledger.length && ledgerRef.current.length)) return;
      const next = localEventRepository.replace(cloudTwin.ledger);
      ledgerRef.current = next;
      stateRef.current = replayEvents(createSeedState(), next);
      setLedger(next);
    };
    const retry = () => { void synchronize().catch(() => undefined); };
    void synchronize().catch(() => {
      setSyncState({ status: "waiting", pending: browserCloudCommandOutbox.pendingCount() });
    });
    window.addEventListener("online", retry);
    return () => { cancelled = true; window.removeEventListener("online", retry); };
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
  useEffect(() => {
    if (!isCloudSyncConfigured()) return;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || browserCloudCommandOutbox.pendingCount()) return;
      const cloudTwin = await getCloudTwin();
      if (!active || cloudTwin.ledger.length <= ledgerRef.current.length) return;
      const next = localEventRepository.replace(cloudTwin.ledger);
      ledgerRef.current = next;
      stateRef.current = replayEvents(createSeedState(), next);
      setLedger(next);
    };
    const interval = window.setInterval(() => { void refresh().catch(() => undefined); }, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    if (browserNotifications !== "granted") return;
    void showUnseenWardrobeNotifications(Object.values(state.autonomy.notifications)).catch(() => undefined);
  }, [browserNotifications, state.autonomy.notifications]);
  useEffect(() => {
    if (!isCloudSyncConfigured()) return;
    let active = true;
    void getLiveContext().then((context) => {
      if (active) setLiveForecast(context.forecast);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [state.userProfile.latitude, state.userProfile.longitude, state.userProfile.locationLabel]);
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
    () => autonomyExecution?.decision ?? evaluateWearCast(state, liveForecast, new Date().toISOString()),
    [autonomyExecution?.decision, liveForecast, state],
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
    try {
      const pending = browserCloudCommandOutbox.enqueue(command);
      setSyncState({ status: navigator.onLine ? "syncing" : "waiting", pending });
      void flushCloudMirror();
    } catch {
      setError("Saved on this device, but the cloud retry queue is unavailable in this browser.");
    }
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

  function updateWardrobeItem(garment: Garment): boolean {
    try {
      const input = { garment, operationId: operationId("garment-update"), occurredAt: new Date().toISOString() };
      commit(updateGarmentCommand(state, ledger, input));
      mirror({ type: "update-garment", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update garment.");
      return false;
    }
  }

  function archiveWardrobeItem(garmentId: string): boolean {
    try {
      const input = { garmentId, operationId: operationId("garment-archive"), occurredAt: new Date().toISOString() };
      commit(archiveGarmentCommand(state, ledger, input));
      mirror({ type: "archive-garment", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to archive garment.");
      return false;
    }
  }

  function startPersonalWardrobe(): boolean {
    try {
      const input = { operationId: operationId("personal-wardrobe"), occurredAt: new Date().toISOString() };
      commit(activatePersonalWardrobeCommand(state, ledger, input));
      mirror({ type: "activate-personal-wardrobe", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start personal wardrobe.");
      return false;
    }
  }

  function saveUserProfile(profile: UserProfile): boolean {
    try {
      const input = { profile, operationId: operationId("user-profile"), occurredAt: new Date().toISOString() };
      commit(updateUserProfileCommand(ledger, input));
      mirror({ type: "update-user-profile", input });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save wardrobe context.");
      return false;
    }
  }

  async function enableBrowserNotifications(): Promise<BrowserNotificationState> {
    const next = await requestBrowserNotifications();
    setBrowserNotifications(next);
    if (next === "granted") {
      await showUnseenWardrobeNotifications(Object.values(state.autonomy.notifications));
    }
    return next;
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
    const candidates = Object.values(state.garments)
      .filter((garment) => !garment.archived && ["top", "bottom", "outerwear"].includes(garment.category) && ["available", "rewearable", "airing"].includes(garment.state))
      .slice(0, 3)
      .map((garment) => garment.id);
    return candidates.length ? queueLaundry(candidates) : false;
  }

  async function runWearCast(injectNotificationFailure = false): Promise<WearCastExecution> {
    setAutonomyRunning(true);
    setError(null);
    if (injectNotificationFailure) notificationGateway.failNext();
    try {
      if (isCloudSyncConfigured() && !injectNotificationFailure) {
        const sync = await flushCloudMirror();
        if (sync.pending) throw new Error("WearCast is waiting for wardrobe changes to sync.");
        const triggeredAt = new Date().toISOString();
        const triggerId = `manual-${triggeredAt.replace(/\W/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
        const response = await runCloudWearCast({ triggerId, triggeredAt });
        const execution = response.execution ?? await waitForCloudExecution(triggerId, 24, 1_000);
        if (!execution) throw new Error("WearCast is still working. Its checkpoint is safe; try again shortly.");
        setAutonomyExecution(execution);
        if (execution.forecast) setLiveForecast(execution.forecast);
        const cloudTwin = await getCloudTwin();
        const next = localEventRepository.replace(cloudTwin.ledger);
        ledgerRef.current = next;
        stateRef.current = replayEvents(createSeedState(), next);
        setLedger(next);
        return execution;
      }
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
    syncState,
    browserNotifications,
    enableBrowserNotifications,
    wearOutfit,
    checkIn,
    addWardrobeItem,
    updateWardrobeItem,
    archiveWardrobeItem,
    startPersonalWardrobe,
    saveUserProfile,
    saveStyleProfile,
    saveLookDna,
    planCandidate,
    queueLaundry,
    wearCastDecision,
    wearCastForecast: liveForecast,
    autonomyExecution,
    autonomyRunning,
    stageWearCastPressure,
    runWearCast,
    reset,
  };
}
