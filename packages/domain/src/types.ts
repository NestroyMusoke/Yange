export type GarmentState =
  | "available"
  | "reserved"
  | "rewearable"
  | "airing"
  | "laundry"
  | "drying";

export type GarmentCategory =
  | "top"
  | "bottom"
  | "outerwear"
  | "shoes"
  | "accessory";

export type PostWearMode = "wash" | "rewearable" | "airing" | "available";

export type EvidenceProvenance =
  | "user-confirmed"
  | "label-extracted"
  | "ai-estimated";

export type EvidenceReviewStatus = "confirmed" | "needs-review";

export interface EvidenceMeta {
  provenance: EvidenceProvenance;
  confidence: number;
  reviewStatus: EvidenceReviewStatus;
}

export interface EvidenceValue<T> extends EvidenceMeta {
  value: T;
}

export interface GarmentProvenance {
  name: EvidenceMeta;
  category: EvidenceMeta;
  colour: EvidenceMeta;
  material: EvidenceMeta;
}

export type WashMethod =
  | "machine-cold"
  | "machine-warm"
  | "hand-wash"
  | "dry-clean"
  | "unknown";

export type DryMethod =
  | "line-dry"
  | "line-dry-shade"
  | "flat-dry"
  | "tumble-low"
  | "unknown";

export type IronMethod =
  | "low"
  | "medium"
  | "high"
  | "do-not-iron"
  | "unknown";

export type BleachMethod =
  | "allowed"
  | "non-chlorine-only"
  | "do-not-bleach"
  | "unknown";

export interface GarmentCareProfile {
  wash: EvidenceValue<WashMethod>;
  dry: EvidenceValue<DryMethod>;
  iron: EvidenceValue<IronMethod>;
  bleach: EvidenceValue<BleachMethod>;
  notes: EvidenceValue<string[]>;
}

export interface WearPolicy {
  postWearMode: PostWearMode;
  maxWearsBeforeWash: number;
  source: "care-profile" | "user-confirmed";
}

export interface Garment {
  id: string;
  name: string;
  category: GarmentCategory;
  colour: string;
  material: string;
  imageAssetId: string | null;
  careLabelAssetId: string | null;
  provenance: GarmentProvenance;
  careProfile: GarmentCareProfile;
  source: "seed" | "user-added";
  state: GarmentState;
  wearsSinceWash: number;
  wearPolicy: WearPolicy;
}

export type ColourRelationship =
  | "warm"
  | "cool"
  | "neutral"
  | "exploring"
  | "not-set";

export type FitPreference =
  | "tailored"
  | "relaxed"
  | "oversized"
  | "defined-waist"
  | "straight";

export type ComfortPriority =
  | "breathable"
  | "easy-movement"
  | "soft-textures"
  | "coverage"
  | "low-maintenance";

export interface StyleProfile {
  version: 1;
  heightCm: number | null;
  colourRelationship: ColourRelationship;
  preferredColours: string[];
  avoidedColours: string[];
  fitPreferences: FitPreference[];
  comfortPriorities: ComfortPriority[];
  styleWords: string[];
  updatedAt: string | null;
}

export interface LookDna {
  id: string;
  sourceAssetId: string;
  contractVersion: "1.0";
  name: string;
  palette: string[];
  silhouette: string;
  keyPieces: string[];
  layering: string[];
  stylingCues: string[];
  occasionCues: string[];
  confidence: number;
  provenance: "ai-estimated";
  createdAt: string;
}

export interface Outfit {
  id: string;
  name: string;
  occasion: string;
  scheduledFor: string;
  garmentIds: string[];
  status: "planned" | "worn";
  personalMatch: number;
  styleSignals: string[];
}

export interface ConfidenceFeedback {
  outfitId: string;
  value: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  recordedAt: string;
}

export interface PreferenceSignal {
  key: string;
  positiveEvidence: number;
  negativeEvidence: number;
  observations: number;
  score: number;
  certainty: number;
}

export interface StyleMemory {
  feedbackCount: number;
  averageConfidence: number | null;
  signals: Record<string, PreferenceSignal>;
}

export interface TwinState {
  garments: Record<string, Garment>;
  outfits: Record<string, Outfit>;
  feedback: ConfidenceFeedback[];
  styleMemory: StyleMemory;
  styleProfile: StyleProfile;
  inspirationLooks: Record<string, LookDna>;
}

interface EventEnvelope {
  id: string;
  operationId: string;
  occurredAt: string;
}

export type DomainEvent =
  | (EventEnvelope & {
      type: "OutfitWorn";
      payload: { outfitId: string; wearContext: string };
    })
  | (EventEnvelope & {
      type: "GarmentStateChanged";
      payload: {
        garmentId: string;
        from: GarmentState;
        to: GarmentState;
        wearsSinceWash: number;
        reason: PostWearMode;
      };
    })
  | (EventEnvelope & {
      type: "OutfitRiskDetected";
      payload: { outfitId: string; unavailableGarmentIds: string[] };
    })
  | (EventEnvelope & {
      type: "ConfidenceRecorded";
      payload: {
        outfitId: string;
        value: 1 | 2 | 3 | 4 | 5;
        tags: string[];
      };
    })
  | (EventEnvelope & {
      type: "GarmentAdded";
      payload: { garment: Garment };
    })
  | (EventEnvelope & {
      type: "StyleProfileUpdated";
      payload: { profile: StyleProfile };
    })
  | (EventEnvelope & {
      type: "LookDnaCaptured";
      payload: { look: LookDna };
    });

export interface ReadinessResult {
  score: number;
  level: "ready" | "building" | "limited" | "emergency";
  availableGarments: number;
  totalGarments: number;
  feasibleOutfits: number;
  plannedOutfits: number;
  atRiskOutfitIds: string[];
  missingEssentialCategories: GarmentCategory[];
}

export interface ActivityItem {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  tone: "neutral" | "positive" | "warning";
}
