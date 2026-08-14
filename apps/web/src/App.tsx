import { useMemo, useState } from "react";
import type {
  Garment,
  GarmentState,
  PreferenceSignal,
} from "@yange/domain";
import { Atelier } from "./features/intelligence/Atelier";
import { WardrobeStudio } from "./features/studio/WardrobeStudio";
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
    reset,
  } = useYange();
  const [activeView, setActiveView] = useState<"today" | "studio" | "atelier" | "activity">("today");
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Yange home">
          <span className="brand-mark" aria-hidden="true">Y</span>
          <span>Yange</span>
        </a>
        <div className="profile-chip">
          <span className="profile-dot" aria-hidden="true" />
          Amina · Kampala
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
              <section className={`future-card ${fridayAtRisk ? "future-risk" : ""}`}>
                <div className="future-topline">
                  <span>WearCast preview</span>
                  <em>{fridayAtRisk ? "At risk" : "Protected"}</em>
                </div>
                <h3>{fridayOutfit.name}</h3>
                <p>{fridayOutfit.scheduledFor}</p>
                <div className="dependency-line" aria-hidden="true">
                  <span className="today-node">Today</span>
                  <i />
                  <span className={fridayAtRisk ? "risk-node" : "future-node"}>Friday</span>
                </div>
                <p className="future-detail">
                  {fridayAtRisk
                    ? "The cream blouse moved to laundry. The autonomous recovery plan arrives in Phase 4."
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
        <span>Phase 3 · Auditable outfit and care intelligence</span>
        <span>Private local adapter · no cloud credentials connected</span>
      </footer>
    </div>
  );
}
