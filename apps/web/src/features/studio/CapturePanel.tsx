import { useEffect, useRef, useState } from "react";
import {
  MULTIMODAL_CONTRACT_VERSION,
  type AnalysisImageRef,
  type GarmentAnalysisV1,
} from "@yange/contracts";
import type { TestableMultimodalAnalyzer } from "../../aiRuntime";
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
import { YangeText } from "../brand/YangeWordmark";
import { ImageDropzone } from "./ImageDropzone";
import type { CaptureQueue } from "./useCaptureQueue";
import {
  scheduleGarmentCutout,
  type GarmentCutoutStatus,
} from "../../media/garmentCutout";
import { useGarmentPhoto } from "./useGarmentPhoto";

interface CapturePanelProps {
  queue: CaptureQueue;
  analyzer: TestableMultimodalAnalyzer;
  existingGarments: Garment[];
  onAddGarment(garment: Garment): boolean;
  essentialsActionLabel: string;
  onEssentialsReady(): void;
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

const essentialCategories: GarmentCategory[] = ["top", "bottom", "shoes"];

export function CapturePanel({
  queue,
  analyzer,
  existingGarments,
  onAddGarment,
  essentialsActionLabel,
  onEssentialsReady,
}: CapturePanelProps) {
  const garmentSlot = queue.slots.garment;
  const labelSlot = queue.slots["care-label"];
  const [draft, setDraft] = useState<GarmentAnalysisV1 | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [careReviewed, setCareReviewed] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedGarment, setSavedGarment] = useState<Garment | null>(null);
  const [cutoutStatus, setCutoutStatus] = useState<GarmentCutoutStatus>("idle");
  const [showOriginal, setShowOriginal] = useState(false);
  const activeCutoutAssetId = useRef<string | null>(null);
  const capturePhoto = useGarmentPhoto(garmentSlot.asset?.assetId ?? null);

  useEffect(() => {
    const sourceAsset = garmentSlot.asset;
    activeCutoutAssetId.current = sourceAsset?.assetId ?? null;
    setShowOriginal(false);
    if (!sourceAsset) {
      setCutoutStatus("idle");
      return;
    }
    setCutoutStatus("processing");
    void scheduleGarmentCutout(sourceAsset).then(
      () => {
        if (activeCutoutAssetId.current === sourceAsset.assetId) setCutoutStatus("ready");
      },
      (error: unknown) => {
        console.warn(
          `[Yange garment cutout] Original photo retained for ${sourceAsset.assetId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (activeCutoutAssetId.current === sourceAsset.assetId) setCutoutStatus("fallback");
      },
    );
  }, [garmentSlot.asset?.assetId]);

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
    if (onAddGarment(garment)) {
      setSavedName(garment.name);
      setSavedGarment(garment);
      // Cloud sync starts only after the user has confirmed this piece belongs
      // in their wardrobe. A cancelled capture never leaves an orphan cutout.
      void scheduleGarmentCutout(garmentSlot.asset, { syncCloud: true }).catch(() => undefined);
    }
  }

  async function addAnother(): Promise<void> {
    await Promise.all([queue.forget("garment"), queue.forget("care-label")]);
    setDraft(null);
    setAnalysisError(null);
    setCareReviewed(false);
    setSavedName(null);
    setSavedGarment(null);
  }

  const capturedCategories = new Set([
    ...existingGarments.map((garment) => garment.category),
    ...(savedGarment ? [savedGarment.category] : []),
  ]);
  const missingEssential = essentialCategories.find((category) => !capturedCategories.has(category));
  const captureStep = savedName ? 3 : draft ? 2 : garmentSlot.asset ? 1 : 0;

  return (
    <section className="studio-panel studio-capture-panel" aria-labelledby="capture-title">
      <div className="studio-panel-heading">
        <div>
          <h2 id="capture-title">Add something you own.</h2>
          <p>
            Photograph the piece and its care label. Check the details before saving.
          </p>
        </div>
        <div className="adapter-chip">
          <span aria-hidden="true" />
          Private image analysis
        </div>
      </div>

      <div className="privacy-strip">
        <strong>Private by default</strong>
        <span>Your wardrobe photos are prepared privately and only the details you confirm are saved.</span>
      </div>

      <ol className="capture-journey" aria-label="Add garment progress">
        {["Photo", "Review", "Saved"].map((label, index) => {
          const step = index + 1;
          return (
            <li
              key={label}
              className={captureStep > step ? "is-complete" : captureStep === step || (captureStep === 0 && step === 1) ? "is-current" : ""}
              aria-current={captureStep === step || (captureStep === 0 && step === 1) ? "step" : undefined}
            >
              <span>{step}</span><strong>{label}</strong>
            </li>
          );
        })}
      </ol>

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
          {analyzing ? "Reading garment evidence…" : analysisError ? "Retry garment analysis" : "Analyse this garment"}
        </button>
        {cutoutStatus !== "idle" && (
          <span className={`cutout-status is-${cutoutStatus}`} role="status">
            <i aria-hidden="true" />
            {cutoutStatus === "processing"
              ? "Preparing a clean wardrobe view"
              : cutoutStatus === "ready"
                ? "Clean wardrobe view ready"
                : "Original photo kept"}
          </span>
        )}
      </div>

      {garmentSlot.asset && !draft && !analyzing && !analysisError && (
        <div className="next-step-note" role="status">
          <strong>Your photo is ready.</strong>
          <span>Select “Analyse this garment” next. The care label is optional and can be added later.</span>
        </div>
      )}

      {garmentSlot.asset && cutoutStatus !== "idle" && (
        <section className={`clean-view-review is-${cutoutStatus}`} aria-labelledby="clean-view-title">
          <div className="clean-view-copy">
            <span>Wardrobe photo</span>
            <h3 id="clean-view-title">
              {cutoutStatus === "processing"
                ? "Preparing the clean view"
                : cutoutStatus === "ready"
                  ? "Background removed"
                  : "Original photo kept"}
            </h3>
            <p>
              {cutoutStatus === "processing"
                ? "You can continue reviewing the garment while Yange separates it in the background."
                : cutoutStatus === "ready"
                  ? "Switch between the private original and the clean wardrobe view before saving."
                  : "The separation was not reliable enough. Retake against a contrasting background, or safely keep this original."}
            </p>
            <div className="clean-view-controls" role="group" aria-label="Wardrobe photo view">
              <button type="button" className={showOriginal ? "active" : ""} aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>Original</button>
              <button
                type="button"
                className={!showOriginal && cutoutStatus === "ready" ? "active" : ""}
                aria-pressed={!showOriginal && cutoutStatus === "ready"}
                disabled={cutoutStatus !== "ready" || !capturePhoto.cutoutUrl}
                onClick={() => setShowOriginal(false)}
              >
                {cutoutStatus === "processing" ? "Clean view preparing" : "Clean view"}
              </button>
            </div>
          </div>
          <div className={`clean-view-image ${!showOriginal && capturePhoto.cutoutUrl ? "is-cutout" : ""}`}>
            {(showOriginal ? capturePhoto.originalUrl : capturePhoto.cutoutUrl ?? capturePhoto.originalUrl)
              ? <img src={(showOriginal ? capturePhoto.originalUrl : capturePhoto.cutoutUrl ?? capturePhoto.originalUrl) ?? ""} alt={`${draft?.facts.name.value || "Garment"} ${showOriginal || !capturePhoto.cutoutUrl ? "original photograph" : "clean wardrobe view"}`} />
              : <span>Preparing preview</span>}
          </div>
        </section>
      )}

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
              {draft.warnings.map((warning) => <li key={warning}><YangeText>{warning}</YangeText></li>)}
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
                Your review is what confirms these care facts.
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
              <div>
                <strong>{savedName} is now in your wardrobe.</strong>
                <span>{missingEssential ? `Next, add ${missingEssential === "shoes" ? "shoes" : `a ${missingEssential}`} to complete your first outfit essentials.` : "Your top, bottom and shoes are ready for a personal outfit."}</span>
              </div>
              <div className="success-actions">
                {missingEssential ? (
                  <button type="button" className="primary-action compact-action" onClick={() => void addAnother()}>{missingEssential === "shoes" ? "Add shoes next" : `Add ${missingEssential} next`}</button>
                ) : (
                  <button type="button" className="primary-action compact-action" onClick={onEssentialsReady}>{essentialsActionLabel}</button>
                )}
                <button type="button" className="quiet-action" onClick={() => void addAnother()}>Add another piece</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
