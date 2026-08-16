import type {
  ReadinessResult,
  TwinState,
  WearCastDecision,
} from "@yange/domain";
import type { WearCastExecution } from "@yange/orchestrator";
import type { AuraStatus } from "../aura/StyleAura";
import type { StyleAuraProfile } from "../aura/palette";

export type YangeView =
  | "today"
  | "studio"
  | "atelier"
  | "wearcast"
  | "cloud"
  | "judge"
  | "activity";

interface JudgeModeProps {
  state: TwinState;
  readiness: ReadinessResult;
  decision: WearCastDecision;
  execution: WearCastExecution | null;
  ledgerLength: number;
  auraProfile: StyleAuraProfile;
  auraStatus: AuraStatus;
  auraFallbackForced: boolean;
  onNavigate(view: YangeView): void;
  onReset(): void;
  onToggleAuraFailure(): void;
}

interface ProofSignal {
  id: string;
  label: string;
  detail: string;
  proven: boolean;
}

const demoActs: Array<{
  time: string;
  title: string;
  view: YangeView;
  action: string;
  narration: string;
  proves: string;
}> = [
  {
    time: "0:00–0:50",
    title: "Teach, don’t assume",
    view: "studio",
    action: "Open Wardrobe Studio",
    narration: "Capture one garment and its care label, then add an inspiration image. Confirm every uncertain field before it enters the twin.",
    proves: "Multimodality · consent · provenance",
  },
  {
    time: "0:50–1:35",
    title: "Plan from what exists",
    view: "atelier",
    action: "Open Decision Atelier",
    narration: "Ask for Friday dinner. Show the Personal Match receipt, live availability constraints, weather, calendar, and inspiration evidence.",
    proves: "Deterministic planning · explainability",
  },
  {
    time: "1:35–2:20",
    title: "Learn from a real wear",
    view: "today",
    action: "Open Today",
    narration: "Mark City Calm worn and record confidence. Watch garments separate into wash, rewear, airing, and available states while Style Aura absorbs preference evidence.",
    proves: "Memory · state transitions · personalisation",
  },
  {
    time: "2:20–3:25",
    title: "Let the agent act",
    view: "wearcast",
    action: "Open WearCast",
    narration: "Stage the transparent 50% pressure case, compare Do nothing with Autopilot, inject one notification outage, then resume the same checkpointed run.",
    proves: "Autonomy · weather timing · recovery",
  },
  {
    time: "3:25–4:00",
    title: "Prove the boundary",
    view: "cloud",
    action: "Open Cloud Proof",
    narration: "Show the six server checkpoints, trace receipt and Google evidence card. End on the architecture, not a claim slide.",
    proves: "Failure isolation · Google Cloud · observability",
  },
];

const statusLabel: Record<AuraStatus, string> = {
  starting: "starting",
  live: "WebGL live",
  adaptive: "adaptive quality",
  frozen: "reduced-motion still",
  fallback: "isolated fallback",
};

export function JudgeMode({
  state,
  readiness,
  decision,
  execution,
  ledgerLength,
  auraProfile,
  auraStatus,
  auraFallbackForced,
  onNavigate,
  onReset,
  onToggleAuraFailure,
}: JudgeModeProps) {
  const userMediaCount = Object.values(state.garments).filter(
    (garment) => garment.imageAssetId || garment.careLabelAssetId,
  ).length;
  const inspirationCount = Object.keys(state.inspirationLooks).length;
  const plannedCount = Object.values(state.outfits).filter(
    (outfit) => outfit.source === "agent-planned",
  ).length;
  const notifications = Object.values(state.autonomy.notifications);
  const deliveredCount = notifications.filter(
    (notification) => notification.deliveryStatus === "delivered",
  ).length;
  const proofs: ProofSignal[] = [
    {
      id: "capture",
      label: "Multimodal evidence",
      detail: userMediaCount > 0 ? `${userMediaCount} item(s) carry private media evidence` : "Capture a garment or care label",
      proven: userMediaCount > 0,
    },
    {
      id: "inspiration",
      label: "Inspiration understood",
      detail: inspirationCount > 0 ? `${inspirationCount} Look DNA record(s) confirmed` : "Save one inspiration image",
      proven: inspirationCount > 0,
    },
    {
      id: "planning",
      label: "Personal plan committed",
      detail: plannedCount > 0 ? `${plannedCount} agent-planned outfit(s)` : "Reserve an Atelier candidate",
      proven: plannedCount > 0,
    },
    {
      id: "memory",
      label: "Confidence memory",
      detail: state.styleMemory.feedbackCount > 0 ? `${state.styleMemory.feedbackCount} lived check-in(s)` : "Wear and rate today’s outfit",
      proven: state.styleMemory.feedbackCount > 0,
    },
    {
      id: "pressure",
      label: "Operational risk detected",
      detail: decision.capacity.triggered ? `${Math.round(decision.capacity.ratio * 100)}% unavailable` : "Stage the disclosed pressure fixture",
      proven: decision.capacity.triggered,
    },
    {
      id: "autonomy",
      label: "Autonomy completed",
      detail: execution?.status === "completed" ? `${execution.checkpointHistory.length} durable checkpoint receipts` : "Run or resume WearCast",
      proven: execution?.status === "completed",
    },
  ];
  const proofCount = proofs.filter((proof) => proof.proven).length;

  return (
    <div className="judge-shell">
      <section className="judge-hero">
        <div>
          <p className="eyebrow">Seeded judge mode · live state only</p>
          <h2>Four minutes. One wardrobe. No hand-waving.</h2>
          <p>
            This director never fabricates success. Each light turns on only when
            a real event, projection, checkpoint, or renderer state exists.
          </p>
          <div className="judge-hero-actions">
            <button type="button" className="primary-action" onClick={() => onNavigate("studio")}>
              Begin the live journey
            </button>
            <button type="button" className="quiet-action" onClick={onReset}>
              Reset deterministic demo
            </button>
          </div>
        </div>
        <div className="demo-readiness-orbit" aria-label={`${proofCount} of ${proofs.length} demo proofs ready`}>
          <div
            style={{ "--demo-progress": `${(proofCount / proofs.length) * 360}deg` } as React.CSSProperties}
          >
            <strong>{proofCount}/{proofs.length}</strong>
            <span>live proofs</span>
          </div>
          <small>{ledgerLength} committed events · {readiness.score}% ready</small>
        </div>
      </section>

      <section className="proof-board">
        <div className="judge-section-heading">
          <div>
            <span>Live evidence board</span>
            <h3>The demo earns every green light.</h3>
          </div>
          <em>{proofCount === proofs.length ? "Demo state complete" : `${proofs.length - proofCount} proof(s) remaining`}</em>
        </div>
        <div className="proof-signal-grid">
          {proofs.map((proof, index) => (
            <article className={proof.proven ? "proof-signal is-proven" : "proof-signal"} key={proof.id}>
              <span>{proof.proven ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{proof.label}</strong>
                <small>{proof.detail}</small>
              </div>
              <i>{proof.proven ? "proven" : "waiting"}</i>
            </article>
          ))}
        </div>
      </section>

      <section className="demo-runway">
        <div className="judge-section-heading">
          <div>
            <span>Unedited demo runway</span>
            <h3>One causal story, paced to 4:00.</h3>
          </div>
          <em>5 acts · 1 take</em>
        </div>
        <ol className="demo-act-list">
          {demoActs.map((act, index) => (
            <li key={act.time}>
              <div className="act-index">
                <span>{String(index + 1).padStart(2, "0")}</span>
                {index < demoActs.length - 1 && <i />}
              </div>
              <div className="act-copy">
                <time>{act.time}</time>
                <h4>{act.title}</h4>
                <p>{act.narration}</p>
                <small>{act.proves}</small>
              </div>
              <button type="button" onClick={() => onNavigate(act.view)}>{act.action} <span>↗</span></button>
            </li>
          ))}
        </ol>
      </section>

      <div className="judge-lower-grid">
        <section className="fault-theatre">
          <div className="judge-section-heading">
            <div>
              <span>Failure theatre</span>
              <h3>Break the beauty. Keep the product.</h3>
            </div>
            <em>{statusLabel[auraStatus]}</em>
          </div>
          <div className="fault-boundary-diagram">
            <div className={auraFallbackForced ? "fault-node fault-node-down" : "fault-node"}>
              <span>A</span>
              <strong>Style Aura</strong>
              <small>{auraFallbackForced ? "Renderer unavailable" : statusLabel[auraStatus]}</small>
            </div>
            <i aria-hidden="true">isolated</i>
            <div className="fault-node fault-node-safe">
              <span>Y</span>
              <strong>Wardrobe agent</strong>
              <small>{readiness.score}% readiness · state intact</small>
            </div>
          </div>
          <p>
            The canvas reads a one-way palette projection. It cannot dispatch a
            domain command, write an event, or block the interface.
          </p>
          <button type="button" className="fault-action" onClick={onToggleAuraFailure}>
            {auraFallbackForced ? "Restore WebGL renderer" : "Simulate renderer loss"}
          </button>
        </section>

        <section className="aura-evidence-card">
          <div className="judge-section-heading">
            <div>
              <span>Style Aura receipt</span>
              <h3>Personality you can inspect.</h3>
            </div>
            <em>{Math.round(auraProfile.confidence * 100)}% evidence</em>
          </div>
          <div className="judge-palette">
            {auraProfile.colours.map((colour, index) => (
              <div key={`${colour}-${index}`} style={{ "--swatch": colour } as React.CSSProperties}>
                <i />
                <strong>{auraProfile.labels[index]}</strong>
                <small>{colour}</small>
              </div>
            ))}
          </div>
          <dl className="aura-source-list">
            <div><dt>Chosen colours</dt><dd>{auraProfile.sources.explicitPreferences}</dd></div>
            <div><dt>Inspiration swatches</dt><dd>{auraProfile.sources.inspirationPalettes}</dd></div>
            <div><dt>Confidence signals</dt><dd>{auraProfile.sources.confidenceSignals}</dd></div>
            <div><dt>Confirmed garments</dt><dd>{auraProfile.sources.confirmedGarments}</dd></div>
          </dl>
        </section>
      </div>

      <section className="architecture-ending">
        <div>
          <span>Closing frame</span>
          <h3>Local rehearsal today. The same contracts on Google tomorrow.</h3>
          <p>
            End with a server receipt and architecture boundary: deterministic
            domain policy, checkpointed orchestration, replaceable adapters, and
            a private Google execution plane.
          </p>
        </div>
        <button type="button" onClick={() => onNavigate("cloud")}>Open production proof <span>→</span></button>
      </section>
    </div>
  );
}

