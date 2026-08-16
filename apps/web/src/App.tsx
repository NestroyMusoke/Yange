import { useMemo, useState } from "react";
import type {
  Garment,
  GarmentState,
  PreferenceSignal,
} from "@yange/domain";
import { Atelier } from "./features/intelligence/Atelier";
import { CloudProof } from "./features/cloud/CloudProof";
import { AuraControls } from "./features/aura/AuraControls";
import { StyleAura, type AuraStatus } from "./features/aura/StyleAura";
import { deriveStyleAuraProfile } from "./features/aura/palette";
import { JudgeMode, type YangeView } from "./features/judge/JudgeMode";
import { WardrobeStudio } from "./features/studio/WardrobeStudio";
import { WearCast } from "./features/wearcast/WearCast";
import { useYange } from "./useYange";

const confidenceLabels = [
  "Not myself",
  "Unsure",
  "Okay",
  "Confident",
  "Amazing",
] as const;

const stateLabels: Record<GarmentState, string> = {
  available: "Available",
  reserved: "Reserved",
  rewearable: "Rewearable",
  airing: "Airing",
  laundry: "Laundry",
  drying: "Drying",
};

const auraSceneTone: Record<YangeView, { energy: number; warmth: number }> = {
  today: { energy: 0.83, warmth: 0.58 },
  studio: { energy: 0.77, warmth: 0.7 },
  atelier: { energy: 0.9, warmth: 0.54 },
  wearcast: { energy: 0.96, warmth: 0.28 },
  cloud: { energy: 1, warmth: 0.2 },
  judge: { energy: 0.96, warmth: 0.48 },
  activity: { energy: 0.72, warmth: 0.4 },
};

function garmentTone(garment: Garment): string {
  const tones: Record<string, string> = {
    "cream-blouse": "#d8c7a7",
    "chocolate-trousers": "#6e4937",
    "olive-jacket": "#5e6948",
    "gold-earrings": "#b99b55",
    "black-loafers": "#292a28",
    "ivory-knit": "#e3dccb",
  };
  return tones[garment.id] ?? "#77756f";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function readableSignal(signal: PreferenceSignal): string {
  return signal.key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function App() {
  const {
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
    wearCastForecast,
    autonomyExecution,
    autonomyRunning,
    stageWearCastPressure,
    runWearCast,
    reset,
  } = useYange();
  const [activeView, setActiveView] = useState<YangeView>(() =>
    new URLSearchParams(window.location.search).get("mode") === "judge" ? "judge" : "today",
  );
  const [auraOpen, setAuraOpen] = useState(false);
  const [auraEnergy, setAuraEnergy] = useState(0.72);
  const [auraWarmth, setAuraWarmth] = useState(0.46);
  const [auraStatus, setAuraStatus] = useState<AuraStatus>("starting");
  const [auraFallbackForced, setAuraFallbackForced] = useState(false);
  const todayOutfit = state.outfits["today-city-calm"];
  const fridayOutfit = state.outfits["friday-rooftop"];
  const todayGarments = todayOutfit.garmentIds.map((id) => state.garments[id]);
  const todayFeedback = state.feedback.find(
    (feedback) => feedback.outfitId === todayOutfit.id,
  );
  const learnedSignals = useMemo(
    () =>
      Object.values(state.styleMemory.signals).sort(
        (a, b) => b.score * b.certainty - a.score * a.certainty,
      ),
    [state.styleMemory.signals],
  );
  const fridayAtRisk = readiness.atRiskOutfitIds.includes(fridayOutfit.id);
  const fridayRecovery = Object.values(state.autonomy.recoveries).find(
    (recovery) => recovery.atRiskOutfitId === fridayOutfit.id,
  );
  const fridayFallback = fridayRecovery
    ? state.outfits[fridayRecovery.fallbackOutfitId]
    : null;
  const auraProfile = useMemo(() => deriveStyleAuraProfile(state), [state]);
  const sceneTone = auraSceneTone[activeView];
  const renderedAuraEnergy = Math.min(1, auraEnergy * sceneTone.energy);
  const renderedAuraWarmth = Math.min(1, auraWarmth * 0.7 + sceneTone.warmth * 0.3);

  return (
    <>
      <StyleAura
        profile={auraProfile}
        energy={renderedAuraEnergy}
        warmth={renderedAuraWarmth}
        forcedFallback={auraFallbackForced}
        onStatusChange={setAuraStatus}
      />
      <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Yange home">
          <span className="brand-mark" aria-hidden="true">Y</span>
          <span>Yange</span>
        </a>
        <div className="topbar-actions">
          <AuraControls
            profile={auraProfile}
            status={auraStatus}
            energy={auraEnergy}
            warmth={auraWarmth}
            open={auraOpen}
            onToggle={() => setAuraOpen((current) => !current)}
            onEnergyChange={setAuraEnergy}
            onWarmthChange={setAuraWarmth}
          />
          <div className="profile-chip">
          <span className="profile-dot" aria-hidden="true" />
          Amina · Kampala
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">Friday, 14 August · Kampala</p>
            <h1>Your wardrobe, thinking ahead.</h1>
            <p className="hero-copy">
              One recommendation. Real availability. A memory that learns what
              confidence feels like on you.
            </p>
          </div>
          <div className={`readiness-card readiness-${readiness.level}`}>
            <div
              className="readiness-ring"
              style={{ "--readiness": `${readiness.score * 3.6}deg` } as React.CSSProperties}
              aria-label={`Wardrobe readiness ${readiness.score} percent`}
            >
              <strong>{readiness.score}</strong>
              <span>%</span>
            </div>
            <div>
              <span className="metric-label">Wardrobe readiness</span>
              <strong className="metric-status">
                {readiness.level === "ready"
                  ? "Ready for the week"
                  : fridayRecovery
                    ? "Friday has a fallback"
                    : fridayAtRisk
                    ? "One future look at risk"
                    : "Laundry is building"}
              </strong>
              <small>
                {readiness.availableGarments} of {readiness.totalGarments} core pieces available
              </small>
            </div>
          </div>
        </section>

        <nav className="view-tabs" aria-label="Yange views">
          <button
            type="button"
            className={activeView === "today" ? "active" : ""}
            onClick={() => setActiveView("today")}
          >
            Today
          </button>
          <button
            type="button"
            className={activeView === "wearcast" ? "active" : ""}
            onClick={() => setActiveView("wearcast")}
          >
            WearCast
            {(wearCastDecision.risks.length > 0 || autonomyExecution?.status === "failed") && (
              <span className="count">{wearCastDecision.risks.length || "!"}</span>
            )}
          </button>
          <button
            type="button"
            className={activeView === "cloud" ? "active" : ""}
            onClick={() => setActiveView("cloud")}
          >
            Cloud proof
            <span className="proof-dot" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={activeView === "judge" ? "active" : ""}
            onClick={() => setActiveView("judge")}
          >
            Judge mode
            <span className="judge-tab-mark" aria-hidden="true">✦</span>
          </button>
          <button
            type="button"
            className={activeView === "studio" ? "active" : ""}
            onClick={() => setActiveView("studio")}
          >
            Wardrobe studio
            {Object.keys(state.inspirationLooks).length > 0 && (
              <span className="count">{Object.keys(state.inspirationLooks).length}</span>
            )}
          </button>
          <button
            type="button"
            className={activeView === "atelier" ? "active" : ""}
            onClick={() => setActiveView("atelier")}
          >
            Decision atelier
            {Object.values(state.outfits).some((outfit) => outfit.source === "agent-planned") && (
              <span className="count">
                {Object.values(state.outfits).filter((outfit) => outfit.source === "agent-planned").length}
              </span>
            )}
          </button>
          <button
            type="button"
            className={activeView === "activity" ? "active" : ""}
            onClick={() => setActiveView("activity")}
          >
            Agent activity
            {ledger.length > 0 && <span className="count">{ledger.length}</span>}
          </button>
        </nav>

        {error && <div className="error-banner" role="alert">{error}</div>}

        {activeView === "today" ? (
          <div className="content-grid">
            <section className="outfit-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Today’s recommendation</p>
                  <h2>{todayOutfit.name}</h2>
                  <p>{todayOutfit.occasion}</p>
                </div>
                <div className="match-score" aria-label={`Personal Match ${todayOutfit.personalMatch} percent`}>
                  <strong>{todayOutfit.personalMatch}%</strong>
                  <span>Personal Match</span>
                </div>
              </div>

              <div className="garment-grid">
                {todayGarments.map((garment) => (
                  <article className="garment-tile" key={garment.id}>
                    <div
                      className="garment-swatch"
                      style={{ backgroundColor: garmentTone(garment) }}
                      aria-hidden="true"
                    >
                      <span>{garment.category}</span>
                    </div>
                    <div>
                      <strong>{garment.name}</strong>
                      <span>{garment.material}</span>
                      <em className={`state state-${garment.state}`}>
                        {stateLabels[garment.state]}
                      </em>
                    </div>
                  </article>
                ))}
              </div>

              <div className="why-row">
                <span>Why this works</span>
                <p>
                  Warm neutrals match your Style DNA, the high waist reflects
                  your saved silhouette preference, and every piece began the
                  day available.
                </p>
              </div>

              {todayOutfit.status === "planned" ? (
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => wearOutfit(todayOutfit.id)}
                >
                  I wore this outfit
                </button>
              ) : todayFeedback ? (
                <div className="saved-checkin">
                  <span>Confidence saved</span>
                  <strong>{confidenceLabels[todayFeedback.value - 1]}</strong>
                  <p>Style memory now has evidence from this real experience.</p>
                </div>
              ) : (
                <div className="confidence-panel">
                  <p className="eyebrow">Confidence Check-in</p>
                  <h3>How did this outfit make you feel?</h3>
                  <div className="confidence-scale" aria-label="Confidence rating">
                    {confidenceLabels.map((label, index) => {
                      const value = (index + 1) as 1 | 2 | 3 | 4 | 5;
                      return (
                        <button
                          type="button"
                          key={label}
                          onClick={() => checkIn(todayOutfit.id, value)}
                          aria-label={`${value} out of 5, ${label}`}
                        >
                          <span>{value}</span>
                          <small>{label}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <aside className="side-stack">
              <section className={`future-card ${fridayAtRisk && !fridayRecovery ? "future-risk" : ""}`}>
                <div className="future-topline">
                  <span>WearCast preview</span>
                  <em>{fridayRecovery ? "Fallback ready" : fridayAtRisk ? "At risk" : "Protected"}</em>
                </div>
                <h3>{fridayOutfit.name}</h3>
                <p>{fridayOutfit.scheduledFor}</p>
                <div className="dependency-line" aria-hidden="true">
                  <span className="today-node">Today</span>
                  <i />
                  <span className={fridayAtRisk && !fridayRecovery ? "risk-node" : "future-node"}>Friday</span>
                </div>
                <p className="future-detail">
                  {fridayRecovery
                    ? `${fridayFallback?.name ?? "A verified fallback"} is reserved while the original look recovers.`
                    : fridayAtRisk
                    ? "A dependency moved out of rotation. WearCast can now simulate and execute a safe recovery."
                    : "All dependent garments are currently available."}
                </p>
              </section>

              <section className="memory-card">
                <div className="future-topline">
                  <span>Style memory</span>
                  <em>{state.styleMemory.feedbackCount} check-in</em>
                </div>
                {learnedSignals.length ? (
                  <div className="signal-list">
                    {learnedSignals.slice(0, 3).map((signal) => (
                      <div key={signal.key}>
                        <span>{readableSignal(signal)}</span>
                        <div className="signal-track">
                          <i style={{ width: `${Math.round(signal.score * 100)}%` }} />
                        </div>
                        <small>{Math.round(signal.certainty * 100)}% evidence strength</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-memory">
                    Your first Confidence Check-in will begin shaping colour,
                    silhouette, and context preferences.
                  </p>
                )}
              </section>
            </aside>
          </div>
        ) : activeView === "studio" ? (
          <WardrobeStudio
            state={state}
            onAddGarment={addWardrobeItem}
            onSaveStyle={saveStyleProfile}
            onSaveLook={saveLookDna}
          />
        ) : activeView === "atelier" ? (
          <Atelier
            state={state}
            onPlan={planCandidate}
            onQueueLaundry={queueLaundry}
          />
        ) : activeView === "wearcast" ? (
          <WearCast
            state={state}
            decision={wearCastDecision}
            forecast={wearCastForecast}
            execution={autonomyExecution}
            running={autonomyRunning}
            onStage={stageWearCastPressure}
            onRun={runWearCast}
          />
        ) : activeView === "cloud" ? (
          <CloudProof />
        ) : activeView === "judge" ? (
          <JudgeMode
            state={state}
            readiness={readiness}
            decision={wearCastDecision}
            execution={autonomyExecution}
            ledgerLength={ledger.length}
            auraProfile={auraProfile}
            auraStatus={auraStatus}
            auraFallbackForced={auraFallbackForced}
            onNavigate={setActiveView}
            onReset={reset}
            onToggleAuraFailure={() => setAuraFallbackForced((current) => !current)}
          />
        ) : (
          <section className="activity-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Committed evidence</p>
                <h2>Agent Activity</h2>
                <p>Every visible item comes from the append-only event ledger.</p>
              </div>
              {ledger.length > 0 && (
                <button type="button" className="quiet-action" onClick={reset}>
                  Reset Yange demo
                </button>
              )}
            </div>
            {activity.length ? (
              <ol className="activity-list">
                {activity.map((item) => (
                  <li key={item.id} className={`activity-${item.tone}`}>
                    <span className="activity-marker" aria-hidden="true" />
                    <div>
                      <time>{formatTime(item.occurredAt)}</time>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-activity">
                <span aria-hidden="true">◎</span>
                <h3>The twin is ready.</h3>
                <p>Wear today’s outfit to create the first committed events.</p>
                <button type="button" onClick={() => setActiveView("today")}>
                  Return to today
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <footer>
        <span>Phase 6 · Submission-ready agent experience</span>
        <span>Learned Style Aura · deterministic judge mode · Google-ready boundary</span>
      </footer>
      </div>
    </>
  );
}
