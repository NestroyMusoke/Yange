import { useState } from "react";
import {
  MULTIMODAL_CONTRACT_VERSION,
  type AnalysisImageRef,
  type FakeGeminiMultimodalAdapter,
  type GarmentAnalysisV1,
} from "@yange/contracts";
import type {
  BleachMethod,
  DryMethod,
  EvidenceMeta,
  EvidenceValue,
  Garment,
  GarmentCareProfile,
  GarmentCategory,
  IronMethod,
  WashMethod,
} from "@yange/domain";
import { EvidenceBadge } from "./EvidenceBadge";
import { ImageDropzone } from "./ImageDropzone";
import type { CaptureQueue } from "./useCaptureQueue";

interface CapturePanelProps {
  queue: CaptureQueue;
  analyzer: FakeGeminiMultimodalAdapter;
  onAddGarment(garment: Garment): boolean;
}

function userEvidence<T>(value: T): EvidenceValue<T> {
  return {
    value,
    provenance: "user-confirmed",
    confidence: 1,
    reviewStatus: "confirmed",
  };
}

function metaOf<T>(evidence: EvidenceValue<T>): EvidenceMeta {
  return {
    provenance: evidence.provenance,
    confidence: evidence.confidence,
    reviewStatus: evidence.reviewStatus,
  };
}

function imageRef(asset: NonNullable<CaptureQueue["slots"]["garment"]["asset"]>): AnalysisImageRef {
  return {
    assetId: asset.assetId,
    kind: asset.kind,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    width: asset.width,
    height: asset.height,
  };
}

const categoryOptions: Array<{ value: GarmentCategory; label: string }> = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "outerwear", label: "Outerwear" },
  { value: "shoes", label: "Shoes" },
  { value: "accessory", label: "Accessory" },
];

const washOptions: Array<{ value: WashMethod; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "machine-cold", label: "Machine wash cold" },
  { value: "machine-warm", label: "Machine wash warm" },
  { value: "hand-wash", label: "Hand wash" },
  { value: "dry-clean", label: "Dry clean" },
];

const dryOptions: Array<{ value: DryMethod; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "line-dry", label: "Line dry" },
  { value: "line-dry-shade", label: "Line dry in shade" },
  { value: "flat-dry", label: "Dry flat" },
  { value: "tumble-low", label: "Tumble dry low" },
];

const ironOptions: Array<{ value: IronMethod; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "low", label: "Low iron" },
  { value: "medium", label: "Medium iron" },
  { value: "high", label: "High iron" },
  { value: "do-not-iron", label: "Do not iron" },
];

const bleachOptions: Array<{ value: BleachMethod; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "allowed", label: "Bleach allowed" },
  { value: "non-chlorine-only", label: "Non-chlorine only" },
  { value: "do-not-bleach", label: "Do not bleach" },
];

export function CapturePanel({ queue, analyzer, onAddGarment }: CapturePanelProps) {
  const garmentSlot = queue.slots.garment;
  const labelSlot = queue.slots["care-label"];
  const [draft, setDraft] = useState<GarmentAnalysisV1 | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [careReviewed, setCareReviewed] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);

  const analyzing = garmentSlot.status === "analyzing";
  const canAnalyze = Boolean(garmentSlot.asset) && !analyzing;

  async function analyzeGarment(): Promise<void> {
    if (!garmentSlot.asset) return;
    const kinds = labelSlot.asset
      ? (["garment", "care-label"] as const)
      : (["garment"] as const);
    queue.setAnalysisStatus([...kinds], "analyzing");
    setAnalysisError(null);
    setSavedName(null);
    try {
      const result = await analyzer.analyze({
        contractVersion: MULTIMODAL_CONTRACT_VERSION,
        requestId: `garment-analysis-${crypto.randomUUID()}`,
        mode: "garment",
        images: [
          imageRef(garmentSlot.asset),
          ...(labelSlot.asset ? [imageRef(labelSlot.asset)] : []),
        ],
      });
      if (result.mode !== "garment") throw new Error("The adapter returned the wrong analysis mode.");
      setDraft(structuredClone(result));
      setCareReviewed(false);
      queue.setAnalysisStatus([...kinds], "ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Garment analysis failed.";
      setAnalysisError(message);
      queue.setAnalysisStatus([...kinds], "failed", message);
    }
  }

  function updateFact(
    field: "name" | "colour" | "material",
    value: string,
  ): void {
    setDraft((current) =>
      current
        ? {
            ...current,
            facts: { ...current.facts, [field]: userEvidence(value) },
          }
        : current,
    );
  }

  function updateCategory(value: GarmentCategory): void {
    setDraft((current) =>
      current
        ? {
            ...current,
            facts: { ...current.facts, category: userEvidence(value) },
          }
        : current,
    );
  }

  function updateCare<K extends keyof GarmentCareProfile>(
    field: K,
    value: GarmentCareProfile[K]["value"],
  ): void {
    setDraft((current) =>
      current
        ? ({
            ...current,
            careProfile: {
              ...current.careProfile,
              [field]: userEvidence(value),
            },
          } as GarmentAnalysisV1)
        : current,
    );
  }

  const extractedCareNeedsReview = draft
    ? Object.entries(draft.careProfile).some(([key, field]) => {
        const hasActionableValue = key === "notes"
          ? (field.value as string[]).length > 0
          : field.value !== "unknown";
        return hasActionableValue && field.provenance !== "user-confirmed" && field.reviewStatus === "needs-review";
      })
    : false;

  function saveGarment(): void {
    if (!draft || !garmentSlot.asset) return;
    const careProfile = careReviewed
      ? {
          wash: userEvidence(draft.careProfile.wash.value),
          dry: userEvidence(draft.careProfile.dry.value),
          iron: userEvidence(draft.careProfile.iron.value),
          bleach: userEvidence(draft.careProfile.bleach.value),
          notes: userEvidence(draft.careProfile.notes.value),
        }
      : draft.careProfile;
    const garment: Garment = {
      id: `garment-${crypto.randomUUID()}`,
      name: draft.facts.name.value.trim(),
      category: draft.facts.category.value,
      colour: draft.facts.colour.value.trim(),
      material: draft.facts.material.value.trim(),
      imageAssetId: garmentSlot.asset.assetId,
      careLabelAssetId: labelSlot.asset?.assetId ?? null,
      provenance: {
        name: metaOf(draft.facts.name),
        category: metaOf(draft.facts.category),
        colour: metaOf(draft.facts.colour),
        material: metaOf(draft.facts.material),
      },
      careProfile,
      source: "user-added",
      state: "available",
      wearsSinceWash: 0,
      wearPolicy: {
        ...draft.suggestedWearPolicy,
        source: careReviewed ? "user-confirmed" : "care-profile",
      },
    };
    if (onAddGarment(garment)) setSavedName(garment.name);
  }

  async function addAnother(): Promise<void> {
    await Promise.all([queue.forget("garment"), queue.forget("care-label")]);
    setDraft(null);
    setAnalysisError(null);
    setCareReviewed(false);
    setSavedName(null);
  }

  return (
    <section className="studio-panel" aria-labelledby="capture-title">
      <div className="studio-panel-heading">
        <div>
          <h2 id="capture-title">Photograph once. Keep the evidence.</h2>
          <p>
            Yange rewrites images privately on your device, then separates what it saw from
            what you personally confirmed.
          </p>
        </div>
        <div className="adapter-chip">
          <span aria-hidden="true" />
          Private image analysis
        </div>
      </div>

      <div className="privacy-strip">
        <strong>Private by default</strong>
        <span>Original images never leave this browser. The event ledger stores IDs, not pixels.</span>
      </div>

      <div className="capture-grid">
        <ImageDropzone
          kind="garment"
          title="Garment photo"
          description="Lay the piece flat or hang it against a simple background. JPEG, PNG, or WebP up to 12 MB."
          slot={garmentSlot}
          onFile={(file) => void queue.process("garment", file)}
          onDemo={() => void queue.useDemo("garment")}
          onRetry={() => void queue.retry("garment")}
          onRemove={() => void queue.remove("garment")}
        />
        <ImageDropzone
          kind="care-label"
          title="Care-label close-up"
          description="Fill the frame with the fibre content and wash symbols. Yange will still ask you to review them."
          optional
          slot={labelSlot}
          onFile={(file) => void queue.process("care-label", file)}
          onDemo={() => void queue.useDemo("care-label")}
          onRetry={() => void queue.retry("care-label")}
          onRemove={() => void queue.remove("care-label")}
        />
      </div>

      <div className="analysis-actions">
        <button
          type="button"
          className="primary-action compact-action"
          disabled={!canAnalyze}
          onClick={() => void analyzeGarment()}
        >
          {analyzing ? "Reading garment evidence…" : analysisError ? "Retry garment analysis" : "Analyse garment"}
        </button>
        {garmentSlot.asset && !analyzing && (
          <button
            type="button"
            className="quiet-action"
            onClick={() => {
              analyzer.failNext();
              void analyzeGarment();
            }}
          >
            Test a failed analysis
          </button>
        )}
        <small>This test pauses once so you can confirm the prepared image remains available to retry.</small>
      </div>

      {analysisError && (
        <div className="error-banner analysis-error" role="alert">
          <strong>Analysis paused safely.</strong> {analysisError} Your prepared image is still available.
        </div>
      )}

      {draft && (
        <div className="review-card">
          <div className="review-heading">
            <div>
              <h3>Correct anything that is not you.</h3>
            </div>
            <span>Image evidence ready</span>
          </div>

          {draft.warnings.length > 0 && (
            <ul className="analysis-warnings">
              {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          <div className="form-grid">
            <label className="field-group">
              <span>Name <EvidenceBadge evidence={draft.facts.name} /></span>
              <input value={draft.facts.name.value} maxLength={80} onChange={(event) => updateFact("name", event.target.value)} />
            </label>
            <label className="field-group">
              <span>Category <EvidenceBadge evidence={draft.facts.category} /></span>
              <select value={draft.facts.category.value} onChange={(event) => updateCategory(event.target.value as GarmentCategory)}>
                {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Colour <EvidenceBadge evidence={draft.facts.colour} /></span>
              <input value={draft.facts.colour.value} maxLength={80} onChange={(event) => updateFact("colour", event.target.value)} />
            </label>
            <label className="field-group">
              <span>Material <EvidenceBadge evidence={draft.facts.material} /></span>
              <input value={draft.facts.material.value} maxLength={120} onChange={(event) => updateFact("material", event.target.value)} />
            </label>
          </div>

          <div className="care-review-heading">
            <div>
              <h3>Protect the piece before automating laundry.</h3>
            </div>
            {extractedCareNeedsReview && <span className="review-required">Review required</span>}
          </div>

          <div className="care-grid">
            <label className="field-group">
              <span>Wash <EvidenceBadge evidence={draft.careProfile.wash} /></span>
              <select value={draft.careProfile.wash.value} onChange={(event) => updateCare("wash", event.target.value as WashMethod)}>
                {washOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Dry <EvidenceBadge evidence={draft.careProfile.dry} /></span>
              <select value={draft.careProfile.dry.value} onChange={(event) => updateCare("dry", event.target.value as DryMethod)}>
                {dryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Iron <EvidenceBadge evidence={draft.careProfile.iron} /></span>
              <select value={draft.careProfile.iron.value} onChange={(event) => updateCare("iron", event.target.value as IronMethod)}>
                {ironOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="field-group">
              <span>Bleach <EvidenceBadge evidence={draft.careProfile.bleach} /></span>
              <select value={draft.careProfile.bleach.value} onChange={(event) => updateCare("bleach", event.target.value as BleachMethod)}>
                {bleachOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label className="field-group full-field">
            <span>Care notes <EvidenceBadge evidence={draft.careProfile.notes} /></span>
            <input
              value={draft.careProfile.notes.value.join(", ")}
              onChange={(event) => updateCare("notes", event.target.value.split(",").map((note) => note.trim()).filter(Boolean))}
              placeholder="Separate notes with commas"
            />
          </label>

          {extractedCareNeedsReview && (
            <label className="review-confirmation">
              <input type="checkbox" checked={careReviewed} onChange={(event) => setCareReviewed(event.target.checked)} />
              <span>
                <strong>I checked these care facts against the physical label.</strong>
                This explicit action—not model confidence—allows Yange to treat them as confirmed.
              </span>
            </label>
          )}

          <div className="review-footer">
            <div>
              <strong>{draft.suggestedWearPolicy.maxWearsBeforeWash} wear cycle suggested</strong>
              <small>Post-wear state: {draft.suggestedWearPolicy.postWearMode}</small>
            </div>
            <button
              type="button"
              className="primary-action compact-action"
              disabled={Boolean(savedName) || !draft.facts.name.value.trim() || (extractedCareNeedsReview && !careReviewed)}
              onClick={saveGarment}
            >
              {savedName ? "Added to wardrobe" : "Add to my wardrobe"}
            </button>
          </div>

          {savedName && (
            <div className="success-banner" role="status">
              <div><strong>{savedName} is now in your wardrobe.</strong><span>The photo stays in this browser, and the confirmed evidence is saved with the garment.</span></div>
              <button type="button" className="quiet-action" onClick={() => void addAnother()}>Add another piece</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
