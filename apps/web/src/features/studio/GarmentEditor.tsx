import { useEffect, useState } from "react";
import type { BleachMethod, DryMethod, EvidenceValue, Garment, GarmentCategory, IronMethod, PostWearMode, WashMethod } from "@yange/domain";

interface GarmentEditorProps {
  garment: Garment;
  onClose(): void;
  onSave(garment: Garment): boolean;
  onArchive(garmentId: string): boolean;
}

function confirmed<T>(value: T): EvidenceValue<T> {
  return { value, provenance: "user-confirmed", confidence: 1, reviewStatus: "confirmed" };
}

const categories: GarmentCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory"];
const washes: WashMethod[] = ["unknown", "machine-cold", "machine-warm", "hand-wash", "dry-clean"];
const dries: DryMethod[] = ["unknown", "line-dry", "line-dry-shade", "flat-dry", "tumble-low"];
const irons: IronMethod[] = ["unknown", "low", "medium", "high", "do-not-iron"];
const bleaches: BleachMethod[] = ["unknown", "allowed", "non-chlorine-only", "do-not-bleach"];
const postWearModes: Array<{ value: PostWearMode; label: string }> = [
  { value: "wash", label: "Wash after wearing" },
  { value: "rewearable", label: "Ready to rewear" },
  { value: "airing", label: "Air before rewearing" },
  { value: "available", label: "Return to wardrobe" },
];

function title(value: string): string {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function GarmentEditor({ garment, onClose, onSave, onArchive }: GarmentEditorProps) {
  const [draft, setDraft] = useState(() => structuredClone(garment));
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => setDraft(structuredClone(garment)), [garment]);

  function updateFact(field: "name" | "colour" | "material", value: string): void {
    setDraft((current) => ({ ...current, [field]: value, provenance: { ...current.provenance, [field]: { provenance: "user-confirmed", confidence: 1, reviewStatus: "confirmed" } } }));
  }

  function save(): void {
    const next = { ...draft, name: draft.name.trim(), colour: draft.colour.trim(), material: draft.material.trim() };
    if (onSave(next)) onClose();
  }

  return (
    <div className="garment-editor-backdrop" role="presentation">
      <section className="garment-editor" role="dialog" aria-modal="true" aria-labelledby="garment-editor-title" data-liquid-glass>
        <div className="garment-editor-heading">
          <div><span>Wardrobe piece</span><h2 id="garment-editor-title">Edit what Yange remembers.</h2></div>
          <button type="button" onClick={onClose} aria-label="Close garment editor">×</button>
        </div>
        <div className="garment-editor-grid">
          <label className="wide"><span>Name</span><input value={draft.name} maxLength={80} onChange={(event) => updateFact("name", event.target.value)} /></label>
          <label><span>Category</span><select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as GarmentCategory, provenance: { ...current.provenance, category: { provenance: "user-confirmed", confidence: 1, reviewStatus: "confirmed" } } }))}>{categories.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
          <label><span>Colour</span><input value={draft.colour} onChange={(event) => updateFact("colour", event.target.value)} /></label>
          <label className="wide"><span>Material</span><input value={draft.material} onChange={(event) => updateFact("material", event.target.value)} /></label>
          <label><span>Wash</span><select value={draft.careProfile.wash.value} onChange={(event) => setDraft((current) => ({ ...current, careProfile: { ...current.careProfile, wash: confirmed(event.target.value as WashMethod) } }))}>{washes.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
          <label><span>Dry</span><select value={draft.careProfile.dry.value} onChange={(event) => setDraft((current) => ({ ...current, careProfile: { ...current.careProfile, dry: confirmed(event.target.value as DryMethod) } }))}>{dries.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
          <label><span>Iron</span><select value={draft.careProfile.iron.value} onChange={(event) => setDraft((current) => ({ ...current, careProfile: { ...current.careProfile, iron: confirmed(event.target.value as IronMethod) } }))}>{irons.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
          <label><span>Bleach</span><select value={draft.careProfile.bleach.value} onChange={(event) => setDraft((current) => ({ ...current, careProfile: { ...current.careProfile, bleach: confirmed(event.target.value as BleachMethod) } }))}>{bleaches.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>
          <label><span>After wearing</span><select value={draft.wearPolicy.postWearMode} onChange={(event) => setDraft((current) => ({ ...current, wearPolicy: { ...current.wearPolicy, postWearMode: event.target.value as PostWearMode, source: "user-confirmed" } }))}>{postWearModes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Wears before washing</span><input type="number" min="1" max="20" value={draft.wearPolicy.maxWearsBeforeWash} onChange={(event) => setDraft((current) => ({ ...current, wearPolicy: { ...current.wearPolicy, maxWearsBeforeWash: Number(event.target.value), source: "user-confirmed" } }))} /></label>
        </div>
        <div className="garment-editor-actions">
          <div>
            {confirmArchive ? <><span>Remove this piece from future decisions?</span><button type="button" className="danger-action" onClick={() => { if (onArchive(garment.id)) onClose(); }}>Archive piece</button><button type="button" className="quiet-action" onClick={() => setConfirmArchive(false)}>Keep it</button></> : <button type="button" className="quiet-action" onClick={() => setConfirmArchive(true)}>Archive piece</button>}
          </div>
          <button type="button" className="primary-action" disabled={!draft.name.trim() || !draft.colour.trim() || !draft.material.trim()} onClick={save}>Save changes</button>
        </div>
      </section>
    </div>
  );
}
