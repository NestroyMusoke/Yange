import { useEffect, useMemo, useState } from "react";
import type {
  PreferenceSignal,
} from "@yange/domain";
import { Atelier } from "./features/intelligence/Atelier";
import { CloudProof } from "./features/cloud/CloudProof";
import { AuraControls } from "./features/aura/AuraControls";
import { StyleAura, type AuraStatus } from "./features/aura/StyleAura";
import { deriveStyleAuraProfile } from "./features/aura/palette";
import { useGradualAuraProfile } from "./features/aura/projection";
import { JudgeMode, type YangeView } from "./features/judge/JudgeMode";
import { WardrobeStudio } from "./features/studio/WardrobeStudio";
import { WearCast } from "./features/wearcast/WearCast";
import { YangeLogo } from "./features/brand/YangeLogo";
import { YangeText, YangeWordmark } from "./features/brand/YangeWordmark";
import { LiquidGlassFilters } from "./features/glass/LiquidGlassFilters";
import { LiquidGlassRuntime } from "./features/glass/LiquidGlassRuntime";
import { YangeNavigation } from "./features/navigation/YangeNavigation";
import { TodayGarmentCard } from "./features/today/TodayGarmentCard";
import { useYange } from "./useYange";

const confidenceLabels = [
  "Not myself",
  "Unsure",
  "Okay",
  "Confident",
  "Amazing",
] as const;

const auraSceneTone: Record<YangeView, { energy: number; warmth: number }> = {
  today: { energy: 0.83, warmth: 0.58 },
  studio: { energy: 0.77, warmth: 0.7 },
  atelier: { energy: 0.9, warmth: 0.54 },
  wearcast: { energy: 0.96, warmth: 0.28 },
  cloud: { energy: 1, warmth: 0.2 },
  judge: { energy: 0.96, warmth: 0.48 },
  activity: { energy: 0.72, warmth: 0.4 },
};

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

function trackGlassPointer(event: React.PointerEvent<HTMLElement>) {
  if (window.innerWidth <= 720 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - bounds.top}px`);
}

function resetGlassPointer(event: React.PointerEvent<HTMLElement>) {
  event.currentTarget.style.setProperty("--mx", "50%");
  event.currentTarget.style.setProperty("--my", "50%");
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
  } = useYange();
  const [activeView, setActiveView] = useState<YangeView>(() =>
    new URLSearchParams(window.location.search).get("mode") === "judge" ? "judge" : "today",
  );
  const [auraOpen, setAuraOpen] = useState(false);
  const [auraEnergy, setAuraEnergy] = useState(0.82);
  const [auraWarmth, setAuraWarmth] = useState(0.46);
  const [auraStatus, setAuraStatus] = useState<AuraStatus>("starting");
  const [colourAttribution, setColourAttribution] = useState<"automatic" | "loved-colour" | "colour-missed">("automatic");
  const latestAgentOutfit = Object.values(state.outfits)
    .filter((outfit) => outfit.source === "agent-planned")
    .sort((left, right) => (right.scheduledAt ?? "").localeCompare(left.scheduledAt ?? ""))[0];
  const todayOutfit = latestAgentOutfit ?? state.outfits["today-city-calm"];
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
  const learnedAuraProfile = useMemo(() => deriveStyleAuraProfile(state), [state]);
  const auraProfile = useGradualAuraProfile(learnedAuraProfile);
  const sceneTone = auraSceneTone[activeView];
  const renderedAuraEnergy = Math.min(1, auraEnergy * sceneTone.energy);
  const renderedAuraWarmth = Math.min(1, auraWarmth * 0.7 + sceneTone.warmth * 0.3);
  const navigationIndicators: Partial<Record<YangeView, string | number>> = {
    studio: Object.keys(state.inspirationLooks).length,
    atelier: Object.values(state.outfits).filter((outfit) => outfit.source === "agent-planned").length,
    wearcast: wearCastDecision.risks.length || (autonomyExecution?.status === "failed" ? "!" : 0),
    activity: ledger.length,
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [activeView]);

  return (
    <>
      <StyleAura
        profile={auraProfile}
        energy={renderedAuraEnergy}
        warmth={renderedAuraWarmth}
        forcedFallback={false}
        onStatusChange={setAuraStatus}
      />
      <LiquidGlassFilters />
      <LiquidGlassRuntime enabled revision={activeView} />
      <div
        className={`app-shell view-${activeView}`}
        style={{
          "--glass-aura-one": auraProfile.colours[0],
          "--glass-aura-two": auraProfile.colours[1],
        } as React.CSSProperties}
      >
      <div className="header-glass-stage" data-liquid-glass-root>
        <header
          className="site-header"
          data-liquid-glass
          onPointerMove={trackGlassPointer}
          onPointerLeave={resetGlassPointer}
        >
        <div className="topbar">
          <a className="brand" href="#top" aria-label="Yange home" onClick={() => setActiveView("today")}>
            <span className="brand-mark" aria-hidden="true">
              <YangeLogo />
            </span>
          <span className="brand-wordmark">
            <strong><YangeWordmark /></strong>
          </span>
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
            <span>
              <strong>Amina</strong>
              <small>Kampala wardrobe</small>
            </span>
          </div>
        </div>
        </div>
        <YangeNavigation
          activeView={activeView}
          indicators={navigationIndicators}
          onNavigate={setActiveView}
        />
        </header>
      </div>

      <main id="top" data-view={activeView}>
        {activeView === "today" && <section className="hero">
          <div>
            <time className="context-date" dateTime="2026-08-14">Friday, 14 August <span aria-hidden="true">&middot;</span> Kampala</time>
            <h1>Your wardrobe,<br />thinking <span>ahead.</span></h1>
            <p className="hero-copy">
              One recommendation. Real availability. A memory that learns what
              confidence feels like on you.
            </p>
          </div>
          <div className="readiness-glass-stage" data-liquid-glass-root>
            <div
              className={`readiness-card readiness-${readiness.level}`}
              data-liquid-glass
              onPointerMove={trackGlassPointer}
              onPointerLeave={resetGlassPointer}
            >
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
                <span className="readiness-count">
                  {readiness.availableGarments}/{readiness.totalGarments}
                </span>{" "}
                core pieces available
              </small>
            </div>
            </div>
          </div>
        </section>}


        {error && <div className="error-banner" role="alert"><YangeText>{error}</YangeText></div>}

        {activeView === "today" ? (
          <div className="content-grid today-content">
            <section className="outfit-card">
              <div className="section-heading">
                <div>
                  <h2>{todayOutfit.name}</h2>
                  <p>{todayOutfit.occasion}</p>
                </div>
                <div className="match-score" aria-label={`Personal Match ${todayOutfit.personalMatch} percent`}>
                  <strong>{todayOutfit.personalMatch}%</strong>
                  <span>Personal Match</span>
                </div>
              </div>

              <div className="garment-grid today-wardrobe-bleed">
                {todayGarments.map((garment) => <TodayGarmentCard garment={garment} key={garment.id} />)}
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
                  <h3>How did this outfit make you feel?</h3>
                  <p className="confidence-prompt">Did the colours shape how you felt? Choose whole look if it was the complete outfit.</p>
                  <div className="colour-attribution" aria-label="Colour attribution">
                    {([
                      ["automatic", "Whole look"],
                      ["loved-colour", "Colours felt right"],
                      ["colour-missed", "Colours felt off"],
                    ] as const).map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={colourAttribution === value ? "selected" : ""}
                        aria-pressed={colourAttribution === value}
                        onClick={() => setColourAttribution(value)}
                      >{label}</button>
                    ))}
                  </div>
                  <div className="confidence-scale" aria-label="Confidence rating">
                    {confidenceLabels.map((label, index) => {
                      const value = (index + 1) as 1 | 2 | 3 | 4 | 5;
                      return (
                        <button
                          type="button"
                          key={label}
                          onClick={() => checkIn(
                            todayOutfit.id,
                            value,
                            colourAttribution === "automatic" ? [] : [colourAttribution],
                          )}
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
            onNavigate={setActiveView}
          />
        ) : (
          <section className="activity-panel">
            <div className="section-heading">
              <div>
                <h2>Recent activity</h2>
                <p>Your wears, check-ins and wardrobe changes.</p>
              </div>
            </div>
            {activity.length ? (
              <ol className="activity-list">
                {activity.map((item) => (
                  <li key={item.id} className={`activity-${item.tone}`}>
                    <span className="activity-marker" aria-hidden="true" />
                    <div>
                      <time>{formatTime(item.occurredAt)}</time>
                      <strong><YangeText>{item.title}</YangeText></strong>
                      <p><YangeText>{item.detail}</YangeText></p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-activity">
                <span aria-hidden="true">◎</span>
                <h3>Nothing here yet.</h3>
                <p>Wear today’s outfit to begin your wardrobe history.</p>
                <button type="button" onClick={() => setActiveView("today")}>
                  Return to today
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <footer>
        <img
          className="footer-brand-emblem"
          src="/brand/yange-emblem.png"
          alt=""
          width="512"
          height="512"
          loading="lazy"
          decoding="async"
        />
        <YangeWordmark className="footer-wordmark" />
        <span>Your wardrobe. Your rhythm.</span>
      </footer>
      </div>
    </>
  );
}
