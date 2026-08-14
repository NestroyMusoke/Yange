import type {
  SevenDayForecast,
  TwinState,
  WearCastDecision,
  WearCastScenario,
} from "@yange/domain";
import type {
  WearCastExecution,
  WorkflowCheckpoint,
} from "@yange/orchestrator";
import { GarmentPreview } from "../intelligence/GarmentPreview";

interface WearCastProps {
  state: TwinState;
  decision: WearCastDecision;
  forecast: SevenDayForecast;
  execution: WearCastExecution | null;
  running: boolean;
  onStage(): boolean;
  onRun(injectNotificationFailure?: boolean): Promise<WearCastExecution>;
}

const checkpoints: Array<{ id: WorkflowCheckpoint; label: string }> = [
  { id: "triggered", label: "Trigger accepted" },
  { id: "forecast-acquired", label: "Forecast acquired" },
  { id: "decision-simulated", label: "Branches simulated" },
  { id: "interventions-committed", label: "Interventions committed" },
  { id: "notifications-delivered", label: "Notifications delivered" },
  { id: "completed", label: "Run completed" },
];

function localTime(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    timeZone: "Africa/Kampala",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    timeZone: "Africa/Kampala",
    weekday: "short",
    day: "numeric",
  }).format(new Date(value));
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ForecastRail({ forecast, decision }: { forecast: SevenDayForecast; decision: WearCastDecision }) {
  const days = new Map<string, SevenDayForecast["periods"]>();
  for (const period of forecast.periods) {
    const key = period.startsAt.slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), period]);
  }
  return (
    <section className="forecast-panel">
      <div className="forecast-heading">
        <div>
          <span className="capture-kind">Seven-day forecast horizon</span>
          <h3>Kampala, read as operational context.</h3>
        </div>
        <span className="manual-source">Manual fixture · not live weather</span>
      </div>
      <div className="forecast-rail">
        {[...days.entries()].slice(0, 7).map(([date, periods], index) => {
          const temperature = Math.max(...periods.map((period) => period.temperatureC));
          const rain = Math.max(...periods.map((period) => period.precipitationProbability));
          const best = decision.dryingWindows
            .filter((window) => periods.some((period) => period.id === window.periodId))
            .sort((left, right) => right.score - left.score)[0];
          return (
            <article key={date} className={best?.outdoorSafe ? "forecast-day is-open" : "forecast-day"}>
              <span>{index === 0 ? "Today" : localDate(periods[0].startsAt)}</span>
              <strong>{temperature}°</strong>
              <i className={`weather-symbol weather-${periods[0].condition}`} aria-hidden="true" />
              <small>{rain}% rain</small>
              <em>{best?.outdoorSafe ? `${best.score} drying` : "No outdoor window"}</em>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ScenarioCard({ scenario }: { scenario: WearCastScenario }) {
  const autopilot = scenario.mode === "autopilot";
  return (
    <article className={`scenario-card ${autopilot ? "scenario-autopilot" : "scenario-passive"}`}>
      <div className="scenario-topline">
        <span>{autopilot ? "Autopilot" : "Do nothing"}</span>
        <em>{autopilot ? "Protected branch" : "Control branch"}</em>
      </div>
      <strong className="scenario-number">
        {scenario.unresolvedOutfitIds.length}
        <small> unresolved</small>
      </strong>
      <p>{scenario.summary}</p>
      <div className="scenario-facts">
        <span><i />{scenario.scheduledLaundryWindows} laundry windows</span>
        <span><i />{scenario.fallbackReserved ? "Fallback reserved" : "No fallback"}</span>
        <span><i />{scenario.protectedOutfitIds.length} commitments protected</span>
      </div>
    </article>
  );
}

function WorkflowReceipt({ execution }: { execution: WearCastExecution | null }) {
  const reached = new Map(execution?.checkpointHistory.map((entry) => [entry.checkpoint, entry]) ?? []);
  return (
    <section className="workflow-receipt">
      <div className="workflow-heading">
        <div><span className="capture-kind">Resumable workflow receipt</span><h3>Every side effect has a checkpoint.</h3></div>
        <span className={`workflow-status workflow-${execution?.status ?? "idle"}`}>
          {execution?.status ?? "Awaiting trigger"}
        </span>
      </div>
      <ol className="checkpoint-list">
        {checkpoints.map((checkpoint, index) => {
          const entry = reached.get(checkpoint.id);
          const failed = execution?.failure?.checkpoint === checkpoint.id;
          return (
            <li key={checkpoint.id} className={entry ? "is-complete" : failed ? "is-failed" : "is-pending"}>
              <span>{entry ? "✓" : failed ? "!" : index + 1}</span>
              <div><strong>{checkpoint.label}</strong><small>{entry?.detail ?? (failed ? execution?.failure?.message : "Waiting for the prior checkpoint")}</small></div>
              <em>{entry ? localTime(entry.reachedAt) : failed ? "Retryable" : "Pending"}</em>
            </li>
          );
        })}
      </ol>
      {execution && (
        <div className="workflow-metrics">
          <span><strong>{execution.attempts}</strong> attempts</span>
          <span><strong>{execution.deliveredNotificationIds.length}</strong> delivered</span>
          <span><strong>{execution.duplicateTriggerCount}</strong> duplicates ignored</span>
        </div>
      )}
    </section>
  );
}

export function WearCast({
  state,
  decision,
  forecast,
  execution,
  running,
  onStage,
  onRun,
}: WearCastProps) {
  const pressureStaged = decision.capacity.triggered || decision.risks.length > 0;
  const failed = execution?.status === "failed";
  const complete = execution?.status === "completed";
  const notifications = Object.values(state.autonomy.notifications).sort(
    (left, right) => Date.parse(right.queuedAt) - Date.parse(left.queuedAt),
  );
  const scheduledWindows = Object.values(state.autonomy.laundryWindows);
  const fallback = decision.fallbackCandidate;

  return (
    <div className="wearcast-shell">
      <section className="wearcast-hero">
        <div>
          <p className="eyebrow">WearCast Operations · Phase 4</p>
          <h2>Your wardrobe should notice first.</h2>
          <p>Forecast pressure, future outfit dependencies, and care-safe action—evaluated before a small problem becomes Friday-night panic.</p>
        </div>
        <div className="operations-pulse">
          <div className={decision.risks.length ? "pulse-core pulse-alert" : "pulse-core"}><i /><strong>{decision.risks.length}</strong><span>live risks</span></div>
          <span>Scheduler trigger</span>
          <small>14 Aug · 10:30 EAT</small>
        </div>
      </section>

      <section className="autonomy-console">
        <div className="console-copy">
          <span className="capture-kind">Transparent judge controls</span>
          <h3>Friday Rooftop recovery drill</h3>
          <p>These buttons fire the same ports and workflow used by a future Cloud Scheduler trigger. The clock and forecast are fixed so every judge sees the same proof.</p>
          <div className="capacity-meter">
            <div><span>Core wardrobe pressure</span><strong>{Math.round(decision.capacity.ratio * 100)}%</strong></div>
            <div><i style={{ width: `${Math.min(100, decision.capacity.ratio * 100)}%` }} /></div>
            <small>{decision.capacity.unavailableCount} of {decision.capacity.totalCoreClothing} tops, bottoms, and layers unavailable · alert at 50%</small>
          </div>
        </div>
        <div className="demo-sequence">
          <div className={pressureStaged ? "demo-step step-complete" : "demo-step"}>
            <span>01</span><div><strong>Stage pressure</strong><small>3 pieces enter laundry</small></div>
            <button type="button" onClick={onStage} disabled={pressureStaged || running}>{pressureStaged ? "Staged" : "Stage 50% risk"}</button>
          </div>
          <div className={execution ? "demo-step step-complete" : "demo-step"}>
            <span>02</span><div><strong>Fire scheduler</strong><small>Simulate, commit, notify</small></div>
            {!execution ? (
              <div className="trigger-actions">
                <button type="button" onClick={() => void onRun(false)} disabled={!pressureStaged || running}>{running ? "Running…" : "Run normally"}</button>
                <button type="button" onClick={() => void onRun(true)} disabled={!pressureStaged || running}>Inject outage</button>
              </div>
            ) : <em>{execution.status}</em>}
          </div>
          <div className={complete ? "demo-step step-complete" : failed ? "demo-step step-failed" : "demo-step"}>
            <span>03</span><div><strong>{failed ? "Resume checkpoint" : "Prove idempotency"}</strong><small>{failed ? "Retry delivery only" : "Replay exact trigger"}</small></div>
            <button type="button" onClick={() => void onRun(false)} disabled={!execution || running}>{running ? "Resuming…" : failed ? "Resume paused run" : complete ? "Replay exact trigger" : "Waiting"}</button>
          </div>
        </div>
      </section>

      <ForecastRail forecast={forecast} decision={decision} />

      {decision.risks.length ? (
        <>
          <section className="simulation-panel">
            <div className="simulation-heading">
              <div><span className="capture-kind">Non-destructive future simulation</span><h3>Same wardrobe. Two possible Fridays.</h3></div>
              <span>{decision.engineVersion} · inputs cloned</span>
            </div>
            <div className="scenario-grid">
              <ScenarioCard scenario={decision.scenarios.doNothing} />
              <ScenarioCard scenario={decision.scenarios.autopilot} />
            </div>
          </section>

          <section className="intervention-grid">
            <article className="window-card">
              <div className="intervention-topline"><span>Best safe opportunity</span><em>{decision.laundryProposals[0]?.suitabilityScore ?? 0}% suitability</em></div>
              {decision.laundryProposals[0] ? (
                <>
                  <h3>{localTime(decision.laundryProposals[0].dryFrom)}—{localTime(decision.laundryProposals[0].dryUntil)}</h3>
                  <p>Wash from {localTime(decision.laundryProposals[0].washAt)}. Outdoor drying is forecast-safe inside this window, while each care label keeps control of the drying method.</p>
                  <div className="window-loads">
                    {decision.laundryProposals.map((item) => <span key={item.id}><strong>{item.garmentIds.length}</strong> pieces · {item.clusterId.replace("load-", "load ")}</span>)}
                  </div>
                  <small>Suitability is a planning heuristic, not an exact drying-time promise.</small>
                </>
              ) : <div className="no-window"><strong>No outdoor window passed the guardrails.</strong><p>WearCast will rely on the fallback rather than promise unsafe drying.</p></div>}
            </article>

            <article className="fallback-card">
              <div className="intervention-topline"><span>Verified fallback</span><em>{fallback ? `${fallback.personalMatch}% match` : "Not feasible"}</em></div>
              {fallback ? (
                <>
                  <h3>{fallback.name}</h3>
                  <p>Generated from currently usable pieces for {state.outfits[decision.fallbackForOutfitId ?? ""]?.name ?? "the endangered event"}.</p>
                  <div className="fallback-garments">{fallback.garmentIds.map((id) => <GarmentPreview key={id} garment={state.garments[id]} compact />)}</div>
                </>
              ) : <div className="no-window"><strong>Yange refused an incomplete look.</strong><p>No complete top, bottom, and shoes combination is currently feasible.</p></div>}
            </article>
          </section>
        </>
      ) : (
        <section className="wearcast-clear">
          <div className="clear-radar" aria-hidden="true"><i /><i /><i /></div>
          <div><span className="capture-kind">Continuous horizon clear</span><h3>No intervention is justified yet.</h3><p>Stage the transparent Friday scenario above. WearCast will detect the outfit conflict and 50% capacity threshold without a chat prompt.</p></div>
        </section>
      )}

      <div className="operations-grid">
        <WorkflowReceipt execution={execution} />
        <section className="notification-center">
          <div className="workflow-heading"><div><span className="capture-kind">Delivery outbox</span><h3>Notifications are state, not toast confetti.</h3></div><span>{notifications.length} queued</span></div>
          {notifications.length ? (
            <div className="notification-list">
              {notifications.map((notification) => (
                <article key={notification.id} className={`notice-${notification.severity}`}>
                  <span>{titleCase(notification.kind)}</span><em>{notification.deliveryStatus}</em>
                  <strong>{notification.title}</strong><p>{notification.body}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="notification-empty"><span aria-hidden="true">○</span><p>No alerts have been committed. Drafts in simulation are not shown as delivered facts.</p></div>
          )}
          {scheduledWindows.length > 0 && <p className="outbox-footnote">{scheduledWindows.length} laundry intervention{scheduledWindows.length === 1 ? "" : "s"} committed independently of notification delivery.</p>}
        </section>
      </div>
    </div>
  );
}
