import { useEffect, useMemo, useState } from "react";
import type {
  ColourRelationship,
  ComfortPriority,
  FitPreference,
  StyleProfile,
} from "@yange/domain";

interface StyleDnaPanelProps {
  profile: StyleProfile;
  onSave(profile: StyleProfile): boolean;
}

const colourOptions = [
  { name: "cream", hex: "#e6d8ba" },
  { name: "terracotta", hex: "#bd7154" },
  { name: "olive", hex: "#75805b" },
  { name: "chocolate", hex: "#6d4937" },
  { name: "indigo", hex: "#505577" },
  { name: "plum", hex: "#78566f" },
  { name: "rose", hex: "#bc8184" },
  { name: "black", hex: "#272826" },
] as const;

const colourRelationships: Array<{ value: ColourRelationship; label: string; detail: string }> = [
  { value: "warm", label: "Warm", detail: "I often enjoy earthy, golden colour relationships." },
  { value: "cool", label: "Cool", detail: "I often enjoy blue, violet, or silver relationships." },
  { value: "neutral", label: "Neutral", detail: "Both warm and cool relationships can feel right." },
  { value: "exploring", label: "Exploring", detail: "Let confidence check-ins teach Yange over time." },
];

const fitOptions: Array<{ value: FitPreference; label: string }> = [
  { value: "tailored", label: "Tailored" },
  { value: "relaxed", label: "Relaxed" },
  { value: "oversized", label: "Oversized" },
  { value: "defined-waist", label: "Defined waist" },
  { value: "straight", label: "Straight lines" },
];

const comfortOptions: Array<{ value: ComfortPriority; label: string }> = [
  { value: "breathable", label: "Breathability" },
  { value: "easy-movement", label: "Easy movement" },
  { value: "soft-textures", label: "Soft textures" },
  { value: "coverage", label: "Coverage" },
  { value: "low-maintenance", label: "Low maintenance" },
];

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function StyleDnaPanel({ profile, onSave }: StyleDnaPanelProps) {
  const [draft, setDraft] = useState(profile);
  const [styleWords, setStyleWords] = useState(profile.styleWords.join(", "));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(profile);
    setStyleWords(profile.styleWords.join(", "));
  }, [profile]);

  const completion = useMemo(() => {
    const signals = [
      draft.heightCm !== null,
      draft.colourRelationship !== "not-set",
      draft.preferredColours.length > 0,
      draft.fitPreferences.length > 0,
      draft.comfortPriorities.length > 0,
      styleWords.trim().length > 0,
    ];
    return Math.round((signals.filter(Boolean).length / signals.length) * 100);
  }, [draft, styleWords]);

  function chooseColour(name: string, list: "preferredColours" | "avoidedColours") {
    const opposite = list === "preferredColours" ? "avoidedColours" : "preferredColours";
    setDraft((current) => ({
      ...current,
      [list]: toggle(current[list], name),
      [opposite]: current[opposite].filter((colour) => colour !== name),
    }));
    setSaved(false);
  }

  function save(): void {
    const next: StyleProfile = {
      ...draft,
      styleWords: styleWords
        .split(",")
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      updatedAt: new Date().toISOString(),
    };
    if (onSave(next)) setSaved(true);
  }

  return (
    <section className="studio-panel" aria-labelledby="style-dna-title">
      <div className="studio-panel-heading">
        <div>
          <p className="eyebrow">User-controlled personalisation</p>
          <h2 id="style-dna-title">Teach Yange your point of view.</h2>
          <p>
            These are preferences, not body rules. Yange combines what you choose here with
            how confident you actually feel after wearing an outfit.
          </p>
        </div>
        <div className="completion-orbit" aria-label={`Style DNA ${completion}% complete`}>
          <strong>{completion}%</strong>
          <span>Style DNA</span>
        </div>
      </div>

      <div className="agency-note">
        <span aria-hidden="true">✦</span>
        <div>
          <strong>Guidance, never grading.</strong>
          <p>Height helps with proportion suggestions. Colour relationship is self-selected and can always be changed.</p>
        </div>
      </div>

      <div className="dna-form">
        <fieldset className="dna-section">
          <legend>Proportion context</legend>
          <p>Optional. Used for lengths and layering suggestions—not attractiveness scoring.</p>
          <label className="height-field">
            <span>Height</span>
            <div>
              <input
                type="number"
                min="120"
                max="230"
                inputMode="numeric"
                value={draft.heightCm ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((current) => ({ ...current, heightCm: value ? Number(value) : null }));
                  setSaved(false);
                }}
                aria-describedby="height-unit"
              />
              <span id="height-unit">cm</span>
            </div>
          </label>
        </fieldset>

        <fieldset className="dna-section">
          <legend>Colour relationship</legend>
          <p>Choose what you already enjoy, or let Yange learn from confidence check-ins.</p>
          <div className="relationship-grid">
            {colourRelationships.map((option) => (
              <button
                type="button"
                key={option.value}
                className={draft.colourRelationship === option.value ? "selected" : ""}
                aria-pressed={draft.colourRelationship === option.value}
                onClick={() => {
                  setDraft((current) => ({ ...current, colourRelationship: option.value }));
                  setSaved(false);
                }}
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="dna-section">
          <legend>Your colour signals</legend>
          <p>Tap once for “draw me toward this”; use the second row for “suggest less often.”</p>
          <span className="choice-label">Draw me toward</span>
          <div className="colour-choice-grid">
            {colourOptions.map((colour) => (
              <button
                type="button"
                key={`preferred-${colour.name}`}
                className={draft.preferredColours.includes(colour.name) ? "selected" : ""}
                aria-pressed={draft.preferredColours.includes(colour.name)}
                onClick={() => chooseColour(colour.name, "preferredColours")}
              >
                <i style={{ backgroundColor: colour.hex }} aria-hidden="true" />
                <span>{colour.name}</span>
              </button>
            ))}
          </div>
          <span className="choice-label subdued-label">Suggest less often</span>
          <div className="colour-choice-grid compact-colours">
            {colourOptions.map((colour) => (
              <button
                type="button"
                key={`avoided-${colour.name}`}
                className={draft.avoidedColours.includes(colour.name) ? "selected avoid-selected" : ""}
                aria-pressed={draft.avoidedColours.includes(colour.name)}
                onClick={() => chooseColour(colour.name, "avoidedColours")}
              >
                <i style={{ backgroundColor: colour.hex }} aria-hidden="true" />
                <span>{colour.name}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="dna-section split-dna-section">
          <legend>Fit and feeling</legend>
          <div>
            <span className="choice-label">Silhouettes I enjoy</span>
            <div className="pill-choices">
              {fitOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={draft.fitPreferences.includes(option.value) ? "selected" : ""}
                  aria-pressed={draft.fitPreferences.includes(option.value)}
                  onClick={() => {
                    setDraft((current) => ({ ...current, fitPreferences: toggle(current.fitPreferences, option.value) }));
                    setSaved(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="choice-label">What comfort means to me</span>
            <div className="pill-choices">
              {comfortOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={draft.comfortPriorities.includes(option.value) ? "selected" : ""}
                  aria-pressed={draft.comfortPriorities.includes(option.value)}
                  onClick={() => {
                    setDraft((current) => ({ ...current, comfortPriorities: toggle(current.comfortPriorities, option.value) }));
                    setSaved(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="dna-section">
          <legend>Three words that feel like you</legend>
          <p>Comma-separated. These become soft recommendation signals, never hard constraints.</p>
          <label className="field-group full-field">
            <span>Style words</span>
            <input
              value={styleWords}
              maxLength={120}
              placeholder="calm, playful, polished"
              onChange={(event) => {
                setStyleWords(event.target.value);
                setSaved(false);
              }}
            />
          </label>
        </fieldset>
      </div>

      <div className="studio-save-row">
        <div>
          <strong>{saved ? "Style DNA saved to the event ledger." : "You remain the source of truth."}</strong>
          <span>{saved ? "Future recommendations can cite these choices." : "Every field is editable, optional, and reversible."}</span>
        </div>
        <button type="button" className="primary-action compact-action" onClick={save} disabled={saved}>
          {saved ? "Saved" : "Save my Style DNA"}
        </button>
      </div>
    </section>
  );
}
