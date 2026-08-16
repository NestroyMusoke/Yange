import type { AuraStatus } from "./StyleAura";
import type { StyleAuraProfile } from "./palette";

interface AuraControlsProps {
  profile: StyleAuraProfile;
  status: AuraStatus;
  energy: number;
  warmth: number;
  open: boolean;
  onToggle: () => void;
  onEnergyChange: (value: number) => void;
  onWarmthChange: (value: number) => void;
}

const statusLabels: Record<AuraStatus, string> = {
  starting: "Waking",
  live: "WebGL live",
  adaptive: "Adaptive quality",
  frozen: "Reduced motion · frozen",
  fallback: "Safe still fallback",
};

export function AuraControls({
  profile,
  status,
  energy,
  warmth,
  open,
  onToggle,
  onEnergyChange,
  onWarmthChange,
}: AuraControlsProps) {
  return (
    <div className="aura-control-wrap">
      <button
        className="aura-chip"
        type="button"
        aria-expanded={open}
        aria-controls="aura-control-panel"
        onClick={onToggle}
      >
        <span className="aura-mini-palette" aria-hidden="true">
          {profile.colours.map((colour) => (
            <i key={colour} style={{ backgroundColor: colour }} />
          ))}
        </span>
        <span>
          <strong>Style Aura</strong>
          <small>{profile.stage === "personal" ? "Deeply personal" : "Learning you"}</small>
        </span>
      </button>

      {open && (
        <aside className="aura-panel" id="aura-control-panel">
          <div className="aura-panel-heading">
            <div>
              <span>Visible style memory</span>
              <strong>Your colours are becoming the interface.</strong>
            </div>
            <button type="button" onClick={onToggle} aria-label="Close Style Aura controls">×</button>
          </div>
          <div className="aura-palette-row" aria-label="Current learned colourways">
            {profile.colours.map((colour, index) => (
              <span key={`${colour}-${index}`}>
                <i style={{ backgroundColor: colour }} />
                <small>{profile.labels[index]}</small>
              </span>
            ))}
          </div>
          <div className="aura-evidence-meter">
            <div>
              <span>Personalisation evidence</span>
              <strong>{Math.round(profile.confidence * 100)}%</strong>
            </div>
            <div><i style={{ width: `${profile.confidence * 100}%` }} /></div>
            <small>
              {profile.sources.explicitPreferences} chosen colours · {profile.sources.inspirationPalettes} inspiration swatches · {profile.sources.confidenceSignals} confidence signals
            </small>
          </div>
          <label className="aura-slider">
            <span><strong>Energy</strong><small>presence</small></span>
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.01"
              value={energy}
              onChange={(event) => onEnergyChange(Number(event.target.value))}
            />
          </label>
          <label className="aura-slider">
            <span><strong>Warmth</strong><small>emotional temperature</small></span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={warmth}
              onChange={(event) => onWarmthChange(Number(event.target.value))}
            />
          </label>
          <div className={`aura-runtime aura-runtime-${status}`}>
            <i aria-hidden="true" />
            <span>{statusLabels[status]}</span>
            <small>The wardrobe agent works independently of this renderer.</small>
          </div>
        </aside>
      )}
    </div>
  );
}

