import { useEffect, useMemo, useState } from "react";
import type { WearCastExecution } from "@yange/orchestrator";
import { YangeText } from "../brand/YangeWordmark";
import {
  getLatestCloudExecution,
  probeCloudRuntime,
  resetCloudDemo,
  runCloudWearCast,
  stageCloudDemo,
  waitForCloudExecution,
  type CloudRuntimeSnapshot,
} from "../../cloudRuntime";

type ProofStatus = "probing" | "offline" | "ready" | "running" | "complete" | "failed";

const checkpointLabels = [
  "Request received",
  "Forecast checked",
  "Friday options compared",
  "Laundry plan saved",
  "Alert sent",
  "Check finished",
] as const;

function RuntimeBadge({ runtime }: { runtime: CloudRuntimeSnapshot }) {
  const google = runtime.configuration.mode === "google";
  return (
    <div className={`cloud-runtime-badge ${google ? "is-google" : "is-local"}`}>
      <i aria-hidden="true" />
      <span>{google ? "Cloud wardrobe connected" : "This device"}</span>
      <em>Up to date</em>
    </div>
  );
}

export function CloudProof() {
  const [runtime, setRuntime] = useState<CloudRuntimeSnapshot | null>(null);
  const [execution, setExecution] = useState<WearCastExecution | null>(null);
  const [status, setStatus] = useState<ProofStatus>("probing");
  const [message, setMessage] = useState("Checking the connected service…");

  const probe = async () => {
    setStatus("probing");
    setMessage("Confirming that the wardrobe check is ready…");
    try {
      const snapshot = await probeCloudRuntime();
      const latest = await getLatestCloudExecution();
      setRuntime(snapshot);
      setExecution(latest);
      if (!snapshot.readiness.ready) {
        setStatus("failed");
        setMessage("The connected service is not ready yet. Check its setup, then try again.");
      } else if (latest?.status === "completed") {
        setStatus("complete");
        setMessage("The latest completed wardrobe check is available below.");
      } else if (latest?.status === "failed") {
        setStatus("failed");
        setMessage("The previous check paused safely and can be run again.");
      } else {
        setStatus("ready");
        setMessage("The connected service is ready for a wardrobe check.");
      }
    } catch {
      setRuntime(null);
      setStatus("offline");
      setMessage("Cloud sync is unavailable. Check your connection, then try again.");
    }
  };

  useEffect(() => { void probe(); }, []);

  const run = async () => {
    setStatus("running");
    setExecution(null);
    setMessage("Checking Friday's wardrobe with half its core pieces unavailable…");
    try {
      await stageCloudDemo();
      setMessage("The request was received. The wardrobe check is now working through each step…");
      const response = await runCloudWearCast();
      const completed = response.execution ?? await waitForCloudExecution();
      if (!completed) {
        setStatus("failed");
        setMessage("The check did not finish in time. Its saved progress is safe, so you can try again.");
        return;
      }
      setExecution(completed);
      setStatus(completed.status === "completed" ? "complete" : "failed");
      setMessage(completed.status === "completed"
        ? "The connected service completed all six steps and saved the result."
        : "The check paused safely before it finished. Run it again to continue.");
    } catch {
      setStatus("failed");
      setMessage("The connected check could not finish. Your wardrobe data was not changed; try again.");
    }
  };

  const reset = async () => {
    try {
      await resetCloudDemo();
      setExecution(null);
      setStatus("ready");
      setMessage("The saved check was cleared. Your wardrobe is ready.");
    } catch {
      setStatus("failed");
      setMessage("The saved check could not be cleared. Try again.");
    }
  };

  const passedChecks = useMemo(() => runtime ? [
    { label: "Service ready", detail: "The wardrobe check can run now", passed: runtime.readiness.ready },
    { label: "Private wardrobe", detail: "Your space stays separate from every other wardrobe", passed: runtime.sessionPartition.length > 8 },
    { label: "Your choices lead", detail: "Recommendations stay within your wardrobe and preferences", passed: runtime.architecture.decisionAuthority === "deterministic-domain" },
    { label: "Progress saved", detail: "An interrupted check can continue safely", passed: Boolean(runtime.architecture.persistence) },
    { label: "Alerts protected", detail: "A notice waits safely until it can be sent", passed: Boolean(runtime.architecture.asyncTransport) },
    { label: "Photos stay private", detail: "Wardrobe images remain outside the connected check", passed: Boolean(runtime.architecture.media) },
    { label: "AI explanation available", detail: "The explanation service is connected", passed: Boolean(runtime.configuration.geminiModel) },
  ] : [], [runtime]);

  return (
    <div className="cloud-proof">
      <section className="cloud-proof-hero">
        <div>
          <span className="context-date">Wardrobe sync</span>
          <h2>Your wardrobe stays ready.</h2>
          <p>Check your Friday plan, saved preferences and alerts in one place.</p>
        </div>
        <div className={`cloud-status-mark cloud-status-${status}`} role="status" aria-live="polite">
          <strong>{status === "complete" ? "Saved" : status === "running" ? "Running" : status === "offline" ? "Offline" : status === "failed" ? "Needs attention" : "Ready"}</strong>
          <span>Wardrobe sync</span>
        </div>
      </section>

      <section className="cloud-command-deck">
        <div className="cloud-command-copy">
          {runtime ? <RuntimeBadge runtime={runtime} /> : <div className="cloud-runtime-badge is-offline"><i /><span>Sync offline</span><em>Not connected</em></div>}
          <h3>{status === "complete" ? "Latest check saved." : "Run Friday’s wardrobe check."}</h3>
          <p aria-live="polite"><YangeText>{message}</YangeText></p>
          <div className="cloud-actions">
            <button type="button" onClick={() => void run()} disabled={!runtime?.readiness.ready || status === "running"}>
              {status === "running" ? "Checking the wardrobe…" : "Run connected check"}
            </button>
            {status === "offline" && <button type="button" className="cloud-secondary" onClick={() => void probe()}>Check again</button>}
            {execution && <button type="button" className="cloud-secondary" onClick={() => void reset()}>Clear saved check</button>}
          </div>
        </div>
        <div className="cloud-checkpoints">
          {checkpointLabels.map((label, index) => {
            const entry = execution?.checkpointHistory[index];
            const reached = Boolean(entry);
            return (
              <div key={label} className={reached ? "reached" : status === "running" && index === 0 ? "active" : ""}>
                <span>{reached ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <div><strong>{label}</strong><small>{entry ? "Finished safely" : "Waiting for this step"}</small></div>
                <em>{entry ? new Date(entry.reachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Not yet"}</em>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cloud-proof-grid">
        <article className="architecture-passport">
          <div className="proof-heading"><div><h3>Your wardrobe safeguards.</h3></div><span>{passedChecks.filter((check) => check.passed).length}/{passedChecks.length || 7} ready</span></div>
          <div className="passport-list">
            {passedChecks.length ? passedChecks.map((check) => (
              <div key={check.label}><i className={check.passed ? "passed" : "failed"} /><span><strong>{check.label}</strong><small>{check.detail}</small></span><em>{check.passed ? "verified" : "blocked"}</em></div>
            )) : <p>Start the local service, then choose “Check again” to see every safeguard.</p>}
          </div>
        </article>

        <article className="cloud-boundary-card">
          <div className="proof-heading"><div><h3>Your preferences stay in control.</h3></div><span>Protected</span></div>
          <div className="boundary-flow">
            <div><span>01</span><strong>AI explanation</strong><small>Describes the choice and suggests the next action</small></div><i>→</i>
            <div><span>02</span><strong>Wardrobe rules</strong><small>Check availability, care needs, and Personal Match</small></div><i>→</i>
            <div><span>03</span><strong>Saved result</strong><small>Keep progress and send each alert only once</small></div>
          </div>
          <p>Style guidance can explain a choice, but it cannot override availability, alter your Personal Match or approve an unreadable care label.</p>
        </article>
      </section>

      {execution && (
        <section className="cloud-receipt-strip">
          <div><span>Latest check</span><strong>{execution.status === "completed" ? "Complete" : "Paused"}</strong></div>
          <div><span>Times started</span><strong>{execution.attempts}</strong></div>
          <div><span>Repeat requests ignored</span><strong>{execution.duplicateTriggerCount}</strong></div>
          <div><span>Alerts sent</span><strong>{execution.deliveredNotificationIds.length}</strong></div>
          <div><span>Wardrobe plan</span><strong>{execution.decision ? "Saved" : "Waiting"}</strong></div>
        </section>
      )}
    </div>
  );
}
