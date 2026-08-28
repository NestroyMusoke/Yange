import { useEffect, useState } from "react";
import type { UserProfile, WardrobeMode } from "@yange/domain";
import { YangeWordmark } from "../brand/YangeWordmark";

interface ProfileSetupProps {
  open: boolean;
  profile: UserProfile;
  wardrobeMode: WardrobeMode;
  onClose(): void;
  onSave(profile: UserProfile, startPersonalWardrobe: boolean): boolean;
}

export function ProfileSetup({ open, profile, wardrobeMode, onClose, onSave }: ProfileSetupProps) {
  const [draft, setDraft] = useState(profile);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => setDraft(profile), [profile, open]);
  if (!open) return null;

  function useCurrentLocation(): void {
    if (!navigator.geolocation) {
      setLocationError("Location is not available in this browser. Enter your city instead.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({
          ...current,
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
        }));
        setLocating(false);
      },
      () => {
        setLocationError("Location permission was not granted. Enter your city and coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 15 * 60_000 },
    );
  }

  function save(startPersonalWardrobe: boolean): void {
    const next: UserProfile = {
      ...draft,
      displayName: draft.displayName.trim(),
      locationLabel: draft.locationLabel.trim(),
      onboardingCompletedAt: draft.onboardingCompletedAt ?? new Date().toISOString(),
    };
    if (onSave(next, startPersonalWardrobe)) onClose();
  }

  return (
    <div className="profile-setup-backdrop" role="presentation">
      <section className="profile-setup" role="dialog" aria-modal="true" aria-labelledby="profile-setup-title" data-liquid-glass>
        <div className="profile-setup-mark" aria-hidden="true">Y</div>
        <div className="profile-setup-copy">
          <span>Wardrobe context</span>
          <h2 id="profile-setup-title">Make <YangeWordmark /> yours.</h2>
          <p>Your name and city personalise weather, outfit timing and the wardrobe memory on this device.</p>
        </div>

        {!profile.onboardingCompletedAt && (
          <ol className="profile-onboarding-path" aria-label="How Yange begins">
            <li><span>1</span><div><strong>Add your clothes</strong><small>Start with a top, bottom and shoes.</small></div></li>
            <li><span>2</span><div><strong>Get a complete outfit</strong><small>Yange only chooses pieces that are ready.</small></div></li>
            <li><span>3</span><div><strong>Teach it by wearing</strong><small>A confidence check-in shapes what comes next.</small></div></li>
          </ol>
        )}

        <div className="profile-setup-fields">
          <label>
            <span>Your name</span>
            <input autoFocus value={draft.displayName} maxLength={50} placeholder="What should Yange call you?" onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} />
          </label>
          <label>
            <span>City or area</span>
            <input value={draft.locationLabel} maxLength={80} placeholder="Kampala" onChange={(event) => setDraft((current) => ({ ...current, locationLabel: event.target.value }))} />
          </label>
          <button type="button" className="profile-location-action" onClick={useCurrentLocation} disabled={locating}>{locating ? "Finding your location…" : "Use my current location"}</button>
          {locationError && <p className="profile-location-error" role="status">{locationError}</p>}
          <details className="profile-location-details">
            <summary>Adjust weather location</summary>
            <p>Only change these coordinates if the forecast does not match your city.</p>
            <div className="profile-coordinates">
              <label><span>Latitude</span><input type="number" step="0.0001" min="-90" max="90" value={draft.latitude} onChange={(event) => setDraft((current) => ({ ...current, latitude: Number(event.target.value) }))} /></label>
              <label><span>Longitude</span><input type="number" step="0.0001" min="-180" max="180" value={draft.longitude} onChange={(event) => setDraft((current) => ({ ...current, longitude: Number(event.target.value) }))} /></label>
            </div>
          </details>
        </div>

        <div className="profile-setup-actions">
          {profile.onboardingCompletedAt && <button type="button" className="quiet-action" onClick={onClose}>Cancel</button>}
          {wardrobeMode === "demo" && <button type="button" className="quiet-action" disabled={!draft.displayName.trim() || !draft.locationLabel.trim()} onClick={() => save(false)}>Explore with sample clothes</button>}
          <button type="button" className="primary-action" disabled={!draft.displayName.trim() || !draft.locationLabel.trim()} onClick={() => save(wardrobeMode === "demo")}>{wardrobeMode === "demo" ? "Add my own clothes" : "Save changes"}</button>
        </div>
        {wardrobeMode === "demo" && <small className="profile-setup-note">Sample clothes are available for a quick tour. Choose your own clothes for personal recommendations from the start.</small>}
      </section>
    </div>
  );
}
