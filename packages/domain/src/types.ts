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
  state: GarmentState;
  wearsSinceWash: number;
  wearPolicy: WearPolicy;
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

