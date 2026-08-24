import type {
  ReadinessResult,
  TwinState,
  WearCastDecision,
} from "@yange/domain";
import type { WearCastExecution } from "@yange/orchestrator";
import type { AuraStatus } from "../aura/StyleAura";
import type { StyleAuraProfile } from "../aura/palette";
import { YangeText, YangeWordmark } from "../brand/YangeWordmark";

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
  onNavigate(view: YangeView): void;
}

interface ReadinessSignal {
  id: string;
  label: string;
  detail: string;
  ready: boolean;
}

const nextSteps: Array<{
  label: string;
  title: string;
  view: YangeView;
  action: string;
  detail: string;
}> = [
  {
    label: "Your wardrobe",
    title: "Add what you actually wear",
    view: "studio",
    action: "Open Studio",
    detail: "Photograph a piece, check its care label and save any inspiration you want Yange to remember.",
  },
  {
    label: "Your next occasion",
    title: "Plan from what is available",
    view: "atelier",
    action: "Open Atelier",
    detail: "Choose an occasion and compare complete looks grounded in your wardrobe, weather and preferences.",
  },
  {
    label: "Your rhythm",
    title: "Let confidence shape the next look",
    view: "today",
    action: "Open Today",
    detail: "Mark an outfit as worn and save how it felt. Your Style Aura and recommendations will evolve with you.",
  },
];

const auraStatusLabel: Record<AuraStatus, string> = {
  starting: "Warming up",
  live: "Learning active",
  adaptive: "Learning active",
  frozen: "Still mode",
  fallback: "Still mode",
};

export function JudgeMode({
  state,
  readiness,
  decision,
  execution,
  ledgerLength,
  auraProfile,
  auraStatus,
  onNavigate,
}: JudgeModeProps) {
  const userMediaCount = Object.values(state.garments).filter(
    (garment) => garment.imageAssetId || garment.careLabelAssetId,
  ).length;
  const inspirationCount = Object.keys(state.inspirationLooks).length;
  const plannedCount = Object.values(state.outfits).filter(
    (outfit) => outfit.source === "agent-planned",
  ).length;
  const signals: ReadinessSignal[] = [
    {
      id: "capture",
      label: "Wardrobe photos",
      detail: userMediaCount > 0 ? `${userMediaCount} personal ${userMediaCount === 1 ? "piece" : "pieces"} saved` : "Add your first garment photo",
      ready: userMediaCount > 0,
    },
    {
      id: "inspiration",
      label: "Saved inspiration",
      detail: inspirationCount > 0 ? `${inspirationCount} ${inspirationCount === 1 ? "look" : "looks"} remembered` : "Save a look you love",
      ready: inspirationCount > 0,
    },
    {
      id: "planning",
      label: "Planned outfits",
      detail: plannedCount > 0 ? `${plannedCount} ${plannedCount === 1 ? "outfit" : "outfits"} reserved` : "Plan your next occasion",
      ready: plannedCount > 0,
    },
    {
      id: "memory",
      label: "Confidence memory",
      detail: state.styleMemory.feedbackCount > 0 ? `${state.styleMemory.feedbackCount} lived ${state.styleMemory.feedbackCount === 1 ? "check-in" : "check-ins"}` : "Wear and rate an outfit",
      ready: state.styleMemory.feedbackCount > 0,
    },
    {
      id: "pressure",
      label: "Wardrobe pressure",
      detail: decision.capacity.triggered ? `${Math.round(decision.capacity.ratio * 100)}% currently unavailable` : "No urgent laundry pressure",
      ready: !decision.capacity.triggered,
    },
    {
      id: "wearcast",
      label: "WearCast",
      detail: execution?.status === "completed" ? "Your latest wardrobe check is complete" : "Ready when your plans change",
      ready: execution?.status === "completed" || !decision.capacity.triggered,
    },
  ];
  const readyCount = signals.filter((signal) => signal.ready).length;

  return (
    <div className="judge-shell">
      <section className="judge-hero">
        <div>
          <span className="context-date">Your wardrobe review</span>
          <h2>Everything <YangeWordmark /> knows about your style.</h2>
          <p>See what is ready, what is changing and the simplest way to make your next recommendation more personal.</p>
          <div className="judge-hero-actions">
            <button type="button" className="primary-action" onClick={() => onNavigate("studio")}>
              Add to your wardrobe
            </button>
          </div>
        </div>
        <div className="demo-readiness-orbit" aria-label={`${readyCount} of ${signals.length} wardrobe signals ready`}>
          <div
            style={{ "--demo-progress": `${(readyCount / signals.length) * 360}deg` } as React.CSSProperties}
          >
            <strong>{readyCount}/{signals.length}</strong>
            <span>ready</span>
          </div>
          <small>{ledgerLength} wardrobe changes <span aria-hidden="true">•</span> {readiness.score}% ready</small>
        </div>
      </section>

      <section className="demo-runway">
        <div className="judge-section-heading">
          <div><h3>Keep <YangeWordmark /> learning.</h3></div>
          <em>Three useful next steps</em>
        </div>
        <ol className="demo-act-list">
          {nextSteps.map((step, index) => (
            <li key={step.title}>
              <div className="act-index">
                <span>{String(index + 1).padStart(2, "0")}</span>
                {index < nextSteps.length - 1 && <i />}
              </div>
              <div className="act-copy">
                <time>{step.label}</time>
                <h4>{step.title}</h4>
                <p><YangeText>{step.detail}</YangeText></p>
              </div>
              <button type="button" onClick={() => onNavigate(step.view)}>{step.action} <span>↗</span></button>
            </li>
          ))}
        </ol>
      </section>

      <section className="proof-board">
        <div className="judge-section-heading">
          <div><h3>Your wardrobe at a glance.</h3></div>
          <em>{readyCount === signals.length ? "Everything looks good" : `${signals.length - readyCount} ${signals.length - readyCount === 1 ? "item" : "items"} to revisit`}</em>
        </div>
        <div className="proof-signal-grid">
          {signals.map((signal, index) => (
            <article className={signal.ready ? "proof-signal is-proven" : "proof-signal"} key={signal.id}>
              <span>{signal.ready ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{signal.label}</strong>
                <small>{signal.detail}</small>
              </div>
              <i>{signal.ready ? "ready" : "next"}</i>
            </article>
          ))}
        </div>
      </section>

      <section className="aura-evidence-card">
        <div className="judge-section-heading">
          <div><h3>Your colour story.</h3></div>
          <em>{auraStatusLabel[auraStatus]}</em>
        </div>
        <div className="judge-palette">
          {auraProfile.colours.map((colour, index) => (
            <div key={`${colour}-${index}`} style={{ "--swatch": colour } as React.CSSProperties}>
              <i />
                <strong><YangeText>{auraProfile.labels[index]}</YangeText></strong>
              <small>{colour}</small>
            </div>
          ))}
        </div>
        <dl className="aura-source-list">
          <div><dt>Chosen colours</dt><dd>{auraProfile.sources.explicitPreferences}</dd></div>
          <div><dt>Saved inspiration</dt><dd>{auraProfile.sources.inspirationPalettes}</dd></div>
          <div><dt>Confidence check-ins</dt><dd>{auraProfile.sources.confidenceSignals}</dd></div>
          <div><dt>Wardrobe pieces</dt><dd>{auraProfile.sources.confirmedGarments}</dd></div>
        </dl>
      </section>

      <section className="architecture-ending">
        <div>
          <h3>Your wardrobe keeps moving with you.</h3>
          <p><YangeWordmark /> remembers what you wear, watches what is available and adjusts when plans, weather or laundry change.</p>
        </div>
        <button type="button" onClick={() => onNavigate("activity")}>View recent activity <span>→</span></button>
      </section>
    </div>
  );
}
