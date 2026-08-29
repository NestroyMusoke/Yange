import { useEffect, useMemo, useState } from "react";
import {
  ManualCalendarAdapter,
  ManualWeatherAdapter,
  OUTFIT_EXPLANATION_CONTRACT_VERSION,
  planningContextFrom,
  type OutfitExplanationV1,
} from "@yange/contracts";
import {
  generateOutfitCandidates,
  type DressCode,
  type OutfitCandidate,
  type PlanningOccasion,
  type TwinState,
  type WeatherCondition,
} from "@yange/domain";
import { RuntimeOutfitExplainer } from "../../aiRuntime";
import { getLiveContext, isCloudSyncConfigured, type LiveContextSnapshot } from "../../cloudRuntime";
import { YangeText, YangeWordmark } from "../brand/YangeWordmark";
import { GarmentPreview } from "./GarmentPreview";
import { YangeMirror } from "./YangeMirror";

interface OutfitAtelierProps {
  state: TwinState;
  onPlan(candidate: OutfitCandidate): boolean;
}

interface ExplanationState {
  status: "loading" | "ready" | "failed";
  value?: OutfitExplanationV1;
  error?: string;
}

const occasionOptions: Array<{ value: PlanningOccasion; label: string }> = [
  { value: "creative-work", label: "Creative work" },
  { value: "casual", label: "Casual day" },
  { value: "dinner", label: "Dinner" },
  { value: "formal", label: "Formal event" },
  { value: "travel", label: "Travel" },
];

const dressOptions: Array<{ value: DressCode; label: string }> = [
  { value: "relaxed", label: "Relaxed" },
  { value: "smart-casual", label: "Smart casual" },
  { value: "polished", label: "Polished" },
  { value: "formal", label: "Formal" },
];

const conditions: Array<{ value: WeatherCondition; label: string }> = [
  { value: "clear", label: "Clear" },
  { value: "cloudy", label: "Cloudy" },
  { value: "showers", label: "Passing showers" },
  { value: "rain", label: "Rain" },
  { value: "windy", label: "Windy" },
];

function initialStartTime(): string {
  const next = new Date(Date.now() + 24 * 60 * 60_000);
  next.setHours(19, 0, 0, 0);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CandidateCard({
  candidate,
  state,
  explanation,
  rank,
  planned,
  disabled,
  onPlan,
}: {
  candidate: OutfitCandidate;
  state: TwinState;
  explanation: ExplanationState | undefined;
  rank: number;
  planned: boolean;
  disabled: boolean;
  onPlan(): void;
}) {
  return (
    <article className={`candidate-card ${rank === 0 ? "candidate-leading" : ""}`}>
      <div className="candidate-topline">
        <span>{rank === 0 ? "Best match" : `Alternative ${rank + 1}`}</span>
        <em>{candidate.garmentIds.length} pieces</em>
      </div>
      <div className="candidate-heading">
        <div>
          <h3>{candidate.name}</h3>
          <p>{candidate.context.calendar.title} · {candidate.context.weather.temperatureC}°C · {candidate.context.weather.condition}</p>
        </div>
        <div
          className="candidate-score"
          style={{ "--match": `${candidate.personalMatch * 3.6}deg` } as React.CSSProperties}
          aria-label={`Personal Match ${candidate.personalMatch} percent`}
        >
          <strong>{candidate.personalMatch}</strong><span>%</span>
        </div>
      </div>

      <div className="candidate-garments">
        {candidate.garmentIds.map((id) => <GarmentPreview key={id} garment={state.garments[id]} compact />)}
      </div>

      <details className="decision-details" open={rank === 0}>
        <summary>Why this outfit ranked {rank === 0 ? "first" : `${rank + 1}`}</summary>
        <div className="factor-list">
          {candidate.scoreBreakdown.map((entry) => (
            <div className="factor-row" key={entry.key} title={entry.detail}>
              <span>{entry.label}</span>
              <div><i style={{ width: `${entry.score}%` }} /></div>
              <strong>{entry.score}</strong>
            </div>
          ))}
        </div>

        <div className={`explanation-box explanation-${explanation?.status ?? "loading"}`}>
          {explanation?.status === "ready" && explanation.value ? (
            <>
              <strong>{explanation.value.headline}</strong>
              <p>{explanation.value.rationale}</p>
              {explanation.value.tradeoffs.length > 0 && (
                <small>Trade-off: {explanation.value.tradeoffs[0]}</small>
              )}
            </>
          ) : explanation?.status === "failed" ? (
            <>
              <strong>Explanation unavailable; score unaffected.</strong>
              <p>{explanation.error} The factor receipt remains available.</p>
            </>
          ) : (
            <><strong>Writing the explanation…</strong><p>The ranked result is ready now.</p></>
          )}
        </div>
      </details>

      <div className="candidate-footer">
        <div>
          <strong>{candidate.garmentIds.length} wardrobe dependencies</strong>
          <small>{candidate.constraintTrace.length} wardrobe checks passed</small>
        </div>
        <button type="button" className="primary-action compact-action" disabled={disabled || planned} onClick={onPlan}>
          {planned ? "Outfit reserved" : "Plan and reserve"}
        </button>
      </div>
    </article>
  );
}

export function OutfitAtelier({ state, onPlan }: OutfitAtelierProps) {
  const [eventTitle, setEventTitle] = useState("Dinner out");
  const [startsAt, setStartsAt] = useState(initialStartTime);
  const [occasion, setOccasion] = useState<PlanningOccasion>("dinner");
  const [dressCode, setDressCode] = useState<DressCode>("polished");
  const [temperatureC, setTemperatureC] = useState(24);
  const [rain, setRain] = useState(55);
  const [condition, setCondition] = useState<WeatherCondition>("showers");
  const [inspirationLookId, setInspirationLookId] = useState("");
  const [candidates, setCandidates] = useState<OutfitCandidate[]>([]);
  const [explanations, setExplanations] = useState<Record<string, ExplanationState>>({});
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [plannedCandidateId, setPlannedCandidateId] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<"live" | "manual">(() => isCloudSyncConfigured() ? "live" : "manual");
  const [liveContext, setLiveContext] = useState<LiveContextSnapshot | null>(null);
  const [liveStatus, setLiveStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [useCalendar, setUseCalendar] = useState(false);
  const explainer = useMemo(() => new RuntimeOutfitExplainer(), []);
  const unavailableCount = Object.values(state.garments).filter((garment) =>
    !garment.archived && ["laundry", "drying", "airing", "reserved"].includes(garment.state),
  ).length;

  useEffect(() => {
    if (contextMode !== "live") return;
    let active = true;
    setLiveStatus("loading");
    void getLiveContext(new Date(startsAt).toISOString()).then((snapshot) => {
      if (!active) return;
      setLiveContext(snapshot);
      setTemperatureC(Math.round(snapshot.weather.temperatureC));
      setRain(Math.round(snapshot.weather.precipitationProbability));
      setCondition(snapshot.weather.condition);
      setLiveStatus("ready");
    }).catch(() => { if (active) setLiveStatus("unavailable"); });
    return () => { active = false; };
  }, [contextMode, startsAt]);

  async function explain(generated: OutfitCandidate[]): Promise<void> {
    const initial = Object.fromEntries(
      generated.map((candidate) => [candidate.id, { status: "loading" as const }]),
    );
    setExplanations(initial);
    const results = await Promise.all(
      generated.map(async (candidate): Promise<[string, ExplanationState]> => {
        try {
          const value = await explainer.explain({
            contractVersion: OUTFIT_EXPLANATION_CONTRACT_VERSION,
            requestId: `explanation-${crypto.randomUUID()}`,
            candidate,
          });
          return [candidate.id, { status: "ready", value }];
        } catch (cause) {
          return [
            candidate.id,
            {
              status: "failed",
              error: cause instanceof Error ? cause.message : "Explanation failed.",
            },
          ];
        }
      }),
    );
    setExplanations(Object.fromEntries(results));
  }

  async function generate(failExplanation = false): Promise<void> {
    setGenerating(true);
    setGenerationError(null);
    setPlannedCandidateId(null);
    try {
      if (!eventTitle.trim()) throw new Error("Give the occasion a name.");
      const startsAtIso = new Date(startsAt).toISOString();
      const now = new Date();
      let context;
      if (contextMode === "live") {
        const snapshot = await getLiveContext(startsAtIso);
        setLiveContext(snapshot);
        setTemperatureC(Math.round(snapshot.weather.temperatureC));
        setRain(Math.round(snapshot.weather.precipitationProbability));
        setCondition(snapshot.weather.condition);
        const manualCalendar = await new ManualCalendarAdapter({
          source: "manual-calendar-v1",
          eventId: `manual-${startsAtIso.replace(/\W/g, "")}`,
          title: eventTitle.trim(),
          startsAt: startsAtIso,
          occasion,
          dressCode,
          notes: "User-supplied planning context",
        }).upcoming();
        context = {
          version: 1 as const,
          weather: snapshot.weather,
          calendar: useCalendar && snapshot.calendar ? snapshot.calendar : manualCalendar,
          inspirationLookId: inspirationLookId || null,
        };
      } else {
        context = await planningContextFrom(
          new ManualWeatherAdapter({
            source: "manual-weather-v1",
            location: state.userProfile.locationLabel,
            observedAt: now.toISOString(),
            temperatureC,
            precipitationProbability: rain,
            condition,
          }),
          new ManualCalendarAdapter({
            source: "manual-calendar-v1",
            eventId: `manual-${startsAtIso.replace(/\W/g, "")}`,
            title: eventTitle.trim(),
            startsAt: startsAtIso,
            occasion,
            dressCode,
            notes: "User-supplied planning context",
          }),
          inspirationLookId || null,
        );
      }
      const generated = generateOutfitCandidates(state, context, 3);
      if (!generated.length) {
        throw new Error("No complete look is feasible. Yange needs an available top, bottom, and pair of shoes.");
      }
      setCandidates(generated);
      if (failExplanation) explainer.failNext();
      void explain(generated);
    } catch (cause) {
      setCandidates([]);
      setExplanations({});
      setGenerationError(cause instanceof Error ? cause.message : "Planning failed.");
    } finally {
      setGenerating(false);
    }
  }

  function reserve(candidate: OutfitCandidate): void {
    if (onPlan(candidate)) setPlannedCandidateId(candidate.id);
  }

  return (
    <section className="intelligence-panel" aria-labelledby="outfit-atelier-title">
      <div className="intelligence-heading">
        <div>
          <h2 id="outfit-atelier-title">Choose the moment. Find your look.</h2>
          <p><YangeWordmark /> starts with what is available, then ranks the complete looks that suit your plans.</p>
        </div>
        <div className="engine-chip"><span /> Available garments only</div>
      </div>

      <div className="planning-workbench">
        <form className="context-console" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
          <div className="console-topline"><span>Occasion details</span><em>{state.userProfile.locationLabel} context</em></div>
          <div className="context-source-control" role="group" aria-label="Weather source">
            <button type="button" className={contextMode === "live" ? "active" : ""} onClick={() => setContextMode("live")}>Live weather</button>
            <button type="button" className={contextMode === "manual" ? "active" : ""} onClick={() => setContextMode("manual")}>Adjust manually</button>
            <span className={`context-source-status status-${liveStatus}`}>{contextMode === "manual" ? "Your values" : liveStatus === "ready" ? `${liveContext?.weather.temperatureC.toFixed(0)}°C · ${liveContext?.weather.precipitationProbability.toFixed(0)}% rain` : liveStatus === "loading" ? "Reading forecast…" : "Forecast unavailable"}</span>
          </div>
          <label className="field-group full-field"><span>What are you dressing for?</span><input value={eventTitle} maxLength={80} onChange={(event) => setEventTitle(event.target.value)} /></label>
          <div className="context-grid">
            <label className="field-group"><span>Starts</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
            <label className="field-group"><span>Occasion</span><select value={occasion} onChange={(event) => setOccasion(event.target.value as PlanningOccasion)}>{occasionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="field-group"><span>Dress code</span><select value={dressCode} onChange={(event) => setDressCode(event.target.value as DressCode)}>{dressOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="field-group"><span>Conditions</span><select value={condition} disabled={contextMode === "live"} onChange={(event) => setCondition(event.target.value as WeatherCondition)}>{conditions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          <div className="weather-controls">
            <label><span>Temperature <strong>{temperatureC}°C</strong></span><input type="range" min="12" max="36" value={temperatureC} disabled={contextMode === "live"} onChange={(event) => setTemperatureC(Number(event.target.value))} /></label>
            <label><span>Rain chance <strong>{rain}%</strong></span><input type="range" min="0" max="100" value={rain} disabled={contextMode === "live"} onChange={(event) => setRain(Number(event.target.value))} /></label>
          </div>
          {liveContext?.calendar && <label className="calendar-context-choice"><input type="checkbox" checked={useCalendar} onChange={(event) => setUseCalendar(event.target.checked)} /><span><strong>Use {liveContext.calendar.title}</strong><small>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(liveContext.calendar.startsAt))} · Google Calendar</small></span></label>}
          <label className="field-group full-field"><span>Inspiration memory <small>Optional</small></span><select value={inspirationLookId} onChange={(event) => setInspirationLookId(event.target.value)}><option value="">No saved Look DNA</option>{Object.values(state.inspirationLooks).map((look) => <option key={look.id} value={look.id}>{look.name}</option>)}</select></label>
          <button type="submit" className="primary-action" disabled={generating}>{generating ? "Checking your wardrobe…" : "Find outfit options"}</button>
        </form>

        <details className="decision-receipt">
          <summary>How Personal Match works</summary>
          <div className="decision-receipt-body">
            <h3>Your wardrobe sets the boundaries.</h3>
            <ol>
              <li><strong>1</strong><span>Availability and care needs rule out unsuitable garments.</span></li>
              <li><strong>2</strong><span>Five weighted factors calculate the score.</span></li>
              <li><strong>3</strong><span>Your preferences explain why each look fits.</span></li>
              <li><strong>4</strong><span>Planning the outfit reserves every included garment.</span></li>
            </ol>
            <div className="receipt-metrics"><span><strong>{Object.keys(state.garments).length}</strong> pieces considered</span><span><strong>{unavailableCount}</strong> unavailable rejected</span></div>
          </div>
        </details>
      </div>

      {generationError && <div className="error-banner atelier-error" role="alert"><strong>Planning stopped safely.</strong> <YangeText>{generationError}</YangeText></div>}

      {candidates.length > 0 ? (
        <div className="candidate-results" aria-live="polite">
          <div className="results-heading"><div><h3>Your strongest options.</h3></div><span>{candidates.length} complete looks</span></div>
          <div className="candidate-list">
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                state={state}
                explanation={explanations[candidate.id]}
                rank={index}
                planned={plannedCandidateId === candidate.id}
                disabled={plannedCandidateId !== null}
                onPlan={() => reserve(candidate)}
              />
            ))}
          </div>
          {plannedCandidateId && <div className="success-banner" role="status"><div><strong>Outfit planned.</strong><span>Every included garment is reserved for this occasion.</span></div></div>}
          {plannedCandidateId && candidates.find((candidate) => candidate.id === plannedCandidateId) && (
            <YangeMirror
              candidate={candidates.find((candidate) => candidate.id === plannedCandidateId)!}
              state={state}
            />
          )}
        </div>
      ) : (
        <div className="atelier-empty">
          <div aria-hidden="true"><i /><i /><i /></div>
          <section><span>Waiting for occasion details</span><h3>Every recommendation comes with its reasons.</h3><p>Set the occasion and {state.userProfile.locationLabel} weather above. <YangeWordmark /> will show what is wearable, how each option scored, and any trade-offs.</p></section>
        </div>
      )}
    </section>
  );
}
