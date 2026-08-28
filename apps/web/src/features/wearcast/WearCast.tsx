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
import { YangeText, YangeWordmark } from "../brand/YangeWordmark";
import type { BrowserNotificationState } from "../../notificationRuntime";

interface WearCastProps {
  state: TwinState;
  decision: WearCastDecision;
  forecast: SevenDayForecast;
  execution: WearCastExecution | null;
  running: boolean;
  onStage(): boolean;
  onRun(injectNotificationFailure?: boolean): Promise<WearCastExecution>;
  browserNotifications: BrowserNotificationState;
  onEnableBrowserNotifications(): Promise<BrowserNotificationState>;
}

const checkpoints: Array<{ id: WorkflowCheckpoint; label: string }> = [
  { id: "triggered", label: "Wardrobe check started" },
  { id: "forecast-acquired", label: "Forecast checked" },
  { id: "decision-simulated", label: "Options compared" },
  { id: "interventions-committed", label: "Plan saved" },
  { id: "notifications-delivered", label: "Alert sent" },
  { id: "completed", label: "Check complete" },
];

function localTime(value: string, timeZone = "Africa/Kampala"): string {
  return new Intl.DateTimeFormat("en-UG", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDate(value: string, timeZone = "Africa/Kampala"): string {
  return new Intl.DateTimeFormat("en-UG", {
    timeZone,
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
          <h3>{forecast.location} this week.</h3>
        </div>
        <span className="manual-source">{forecast.source.includes("google") ? "Live Google forecast" : "Forecast preview"}</span>
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
              <span>{index === 0 ? "Today" : localDate(periods[0].startsAt, forecast.timeZone)}</span>
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
        <span>{autopilot ? <><YangeWordmark /> adjusts</> : "Keep the original plan"}</span>
        <em>{autopilot ? "Protected" : "Unchanged"}</em>
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
    <details className="workflow-receipt" open={execution?.status === "failed" || undefined}>
      <summary>Check details</summary>
      <div className="workflow-receipt-body">
      <div className="workflow-heading">
        <div><h3>Your latest wardrobe check.</h3></div>
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
      </div>
    </details>
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
  browserNotifications,
  onEnableBrowserNotifications,
}: WearCastProps) {
  const pressureStaged = decision.capacity.triggered;
  const triggerReady = pressureStaged || decision.risks.length > 0;
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
          <h2>Your wardrobe notices what is coming.</h2>
          <p>Weather, laundry and upcoming plans come together before you need to worry about them.</p>
        </div>
        <div className="operations-pulse">
          <div className={decision.risks.length ? "pulse-core pulse-alert" : "pulse-core"}><i /><strong>{decision.risks.length}</strong><span>live risks</span></div>
          <span>Wardrobe watch</span>
          <small>{forecast.source.includes("google") ? "Live forecast" : "Preview forecast"}</small>
        </div>
      </section>

      <section className="autonomy-console">
        <div className="console-copy">
          <h3>Check the week ahead</h3>
          <p>See how <YangeWordmark /> protects upcoming outfits when laundry and weather compete.</p>
          <div className="capacity-meter">
            <div><span>Core wardrobe pressure</span><strong>{Math.round(decision.capacity.ratio * 100)}%</strong></div>
            <div><i style={{ transform: `scaleX(${Math.min(1, decision.capacity.ratio)})` }} /></div>
            <small>{decision.capacity.unavailableCount} of {decision.capacity.totalCoreClothing} tops, bottoms, and layers unavailable · alert at 50%</small>
          </div>
        </div>
        <div className="wardrobe-watch-status" aria-live="polite">
          <span className={triggerReady ? "watch-light is-alert" : "watch-light"} aria-hidden="true" />
          <div>
            <strong>{triggerReady ? "A wardrobe check is ready" : "Your wardrobe is being watched"}</strong>
            <small>{triggerReady ? "Weather and availability can be checked now." : "Yange will surface a clear action when a planned outfit is at risk."}</small>
          </div>
          {triggerReady ? (
            <button type="button" className="primary-action compact-action" onClick={() => void onRun(false)} disabled={running}>
              {running ? "Checking…" : execution ? "Check again" : "Check now"}
            </button>
          ) : <em className="watch-clear">No action needed</em>}
        </div>
      </section>

      <details className="wearcast-demo-tools">
        <summary>Demo controls</summary>
        <p>Use these controls to reproduce wardrobe pressure and recovery during a technical review.</p>
        <div className="demo-sequence">
          <div className={pressureStaged ? "demo-step step-complete" : "demo-step"}>
            <span>01</span><div><strong>Stage laundry pressure</strong><small>Move three preview pieces into laundry</small></div>
            <button type="button" onClick={onStage} disabled={pressureStaged || running}>{pressureStaged ? "Ready" : "Stage"}</button>
          </div>
          <div className={execution ? "demo-step step-complete" : "demo-step"}>
            <span>02</span><div><strong>Run the wardrobe check</strong><small>Compare the forecast and upcoming outfits</small></div>
            {!execution ? (
              <button type="button" onClick={() => void onRun(false)} disabled={!triggerReady || running}>{running ? "Checking…" : "Run"}</button>
            ) : <em>{execution.status}</em>}
          </div>
          <div className={complete ? "demo-step step-complete" : failed ? "demo-step step-failed" : "demo-step"}>
            <span>03</span><div><strong>{failed ? "Resume safely" : "Verify idempotency"}</strong><small>{failed ? "Continue from the last saved checkpoint" : "Repeat the same trigger without duplicating the alert"}</small></div>
            <button type="button" onClick={() => void onRun(false)} disabled={!execution || running}>{running ? "Finishing…" : failed ? "Resume" : complete ? "Run again" : "Waiting"}</button>
          </div>
        </div>
      </details>

      <ForecastRail forecast={forecast} decision={decision} />

      {decision.risks.length ? (
        <>
          <section className="simulation-panel">
            <div className="simulation-heading">
              <div><h3>Same wardrobe. Two possible outcomes.</h3></div>
              <span>Your options</span>
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
                  <h3>{localTime(decision.laundryProposals[0].dryFrom)} to {localTime(decision.laundryProposals[0].dryUntil)}</h3>
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
              ) : <div className="no-window"><strong><YangeWordmark /> refused an incomplete look.</strong><p>No complete top, bottom, and shoes combination is currently feasible.</p></div>}
            </article>
          </section>
        </>
      ) : (
        <section className="wearcast-clear">
          <div className="clear-radar" aria-hidden="true"><i /><i /><i /></div>
          <div><h3>Your upcoming looks are clear.</h3><p>No action is needed. Yange will guide you here when laundry, weather or an upcoming outfit needs attention.</p></div>
        </section>
      )}

      <div className="operations-grid">
        <WorkflowReceipt execution={execution} />
        <details className="notification-center" open={notifications.length > 0 || undefined}>
          <summary>Notifications</summary>
          <div className="notification-center-body">
          <div className="workflow-heading"><div><h3>Sent notices stay visible.</h3><small>In-app history always remains available.</small></div><div className="notification-permission"><span>{notifications.length} queued</span>{browserNotifications === "prompt" && <button type="button" onClick={() => void onEnableBrowserNotifications()}>Enable device alerts</button>}{browserNotifications === "granted" && <em>Device alerts on</em>}{browserNotifications === "denied" && <em>Device alerts blocked</em>}{browserNotifications === "unsupported" && <em>In-app only</em>}</div></div>
          {notifications.length ? (
            <div className="notification-list">
              {notifications.map((notification) => (
                <article key={notification.id} className={`notice-${notification.severity}`}>
                  <span>{titleCase(notification.kind)}</span><em>{notification.deliveryStatus}</em>
                  <strong><YangeText>{notification.title}</YangeText></strong><p><YangeText>{notification.body}</YangeText></p>
                </article>
              ))}
            </div>
          ) : (
            <div className="notification-empty"><span aria-hidden="true">○</span><p>No wardrobe alerts yet.</p></div>
          )}
          {scheduledWindows.length > 0 && <p className="outbox-footnote">{scheduledWindows.length} laundry window{scheduledWindows.length === 1 ? "" : "s"} saved.</p>}
          </div>
        </details>
      </div>
    </div>
  );
}
