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

export type GarmentStateChangeReason =
  | PostWearMode
  | "outfit-reservation"
  | "laundry-queued";

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
  archived?: boolean;
}

export type WardrobeMode = "demo" | "personal";

export interface UserProfile {
  version: 1;
  displayName: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  onboardingCompletedAt: string | null;
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

export type PlanningOccasion =
  | "creative-work"
  | "casual"
  | "dinner"
  | "formal"
  | "travel";

export type DressCode =
  | "relaxed"
  | "smart-casual"
  | "polished"
  | "formal";

export type WeatherCondition =
  | "clear"
  | "cloudy"
  | "showers"
  | "rain"
  | "windy";

export interface WeatherSnapshot {
  source: string;
  location: string;
  observedAt: string;
  temperatureC: number;
  precipitationProbability: number;
  condition: WeatherCondition;
}

export interface CalendarSnapshot {
  source: string;
  eventId: string;
  title: string;
  startsAt: string;
  occasion: PlanningOccasion;
  dressCode: DressCode;
  notes: string;
}

export interface PlanningContext {
  version: 1;
  weather: WeatherSnapshot;
  calendar: CalendarSnapshot;
  inspirationLookId: string | null;
}

export type MatchFactorKey =
  | "availability"
  | "colour"
  | "style-memory"
  | "context"
  | "care-practicality";

export interface MatchFactor {
  key: MatchFactorKey;
  label: string;
  score: number;
  weight: number;
  weightedPoints: number;
  evidence: string[];
  detail: string;
}

export interface OutfitCandidate {
  id: string;
  engineVersion: "personal-match-v1";
  name: string;
  garmentIds: string[];
  personalMatch: number;
  scoreBreakdown: MatchFactor[];
  styleSignals: string[];
  context: PlanningContext;
  constraintTrace: string[];
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
  source: "seed" | "agent-planned";
  scheduledAt: string | null;
  planningContext: PlanningContext | null;
  scoreBreakdown: MatchFactor[];
  engineVersion: "seed" | "personal-match-v1";
  dependencies: string[];
}

export type LaundryHoldoutReason =
  | "wash-unknown"
  | "care-needs-review"
  | "drying-unknown"
  | "bleach-unknown"
  | "professional-care";

export type LaundryConflictRule =
  | "wash-method"
  | "colour-family"
  | "wash-separately"
  | "similar-colours";

export type LaundryColourFamily = "light" | "dark" | "vivid" | "neutral";

export interface LaundryHoldout {
  garmentId: string;
  reason: LaundryHoldoutReason;
  detail: string;
}

export interface LaundryIncompatibilityEdge {
  leftGarmentId: string;
  rightGarmentId: string;
  rules: LaundryConflictRule[];
  detail: string;
}

export interface LaundryDryingRoute {
  method: Exclude<DryMethod, "unknown">;
  garmentIds: string[];
  instruction: string;
}

export interface LaundryCluster {
  id: string;
  washMethod: Exclude<WashMethod, "unknown" | "dry-clean">;
  bleachMethod: Exclude<BleachMethod, "unknown">;
  colourFamily: LaundryColourFamily;
  garmentIds: string[];
  dryingRoutes: LaundryDryingRoute[];
  instruction: string;
  safetyBasis: string[];
}

export interface LaundryPlan {
  engineVersion: "laundry-graph-v1";
  inputGarmentIds: string[];
  clusters: LaundryCluster[];
  holdouts: LaundryHoldout[];
  incompatibilityEdges: LaundryIncompatibilityEdge[];
}

export interface ForecastPeriod {
  id: string;
  startsAt: string;
  endsAt: string;
  temperatureC: number;
  precipitationProbability: number;
  humidityPercent: number;
  windKph: number;
  condition: WeatherCondition;
  daylight: boolean;
}

export interface SevenDayForecast {
  version: 1;
  source: string;
  location: string;
  timeZone: string;
  issuedAt: string;
  periods: ForecastPeriod[];
}

export type DryingSuitability = "excellent" | "good" | "limited" | "unsafe";

export interface DryingWindowAssessment {
  periodId: string;
  startsAt: string;
  endsAt: string;
  score: number;
  suitability: DryingSuitability;
  outdoorSafe: boolean;
  reasons: string[];
}

export type WearCastRiskSeverity = "watch" | "warning" | "critical";

export interface OutfitDependencyRisk {
  outfitId: string;
  dueAt: string;
  hoursRemaining: number;
  unavailableGarmentIds: string[];
  severity: WearCastRiskSeverity;
}

export interface WardrobeCapacityRisk {
  threshold: number;
  ratio: number;
  unavailableCount: number;
  totalCoreClothing: number;
  affectedGarmentIds: string[];
  triggered: boolean;
}

export interface LaundryWindowProposal {
  id: string;
  clusterId: string;
  garmentIds: string[];
  washAt: string;
  dryFrom: string;
  dryUntil: string;
  deadline: string;
  suitabilityScore: number;
  outdoorRecommended: boolean;
  basis: string[];
}

export interface WearCastNotificationDraft {
  id: string;
  kind: "laundry-risk" | "outfit-recovery" | "wardrobe-capacity";
  severity: WearCastRiskSeverity;
  title: string;
  body: string;
  relatedOutfitId: string | null;
  relatedGarmentIds: string[];
}

export interface WearCastScenario {
  mode: "do-nothing" | "autopilot";
  protectedOutfitIds: string[];
  unresolvedOutfitIds: string[];
  scheduledLaundryWindows: number;
  fallbackReserved: boolean;
  summary: string;
}

export interface WearCastDecision {
  engineVersion: "wearcast-v1";
  decisionId: string;
  generatedAt: string;
  horizonEndsAt: string;
  forecast: SevenDayForecast;
  risks: OutfitDependencyRisk[];
  capacity: WardrobeCapacityRisk;
  dryingWindows: DryingWindowAssessment[];
  laundryProposals: LaundryWindowProposal[];
  fallbackCandidate: OutfitCandidate | null;
  fallbackForOutfitId: string | null;
  notifications: WearCastNotificationDraft[];
  scenarios: {
    doNothing: WearCastScenario;
    autopilot: WearCastScenario;
  };
  decisionTrace: string[];
}

export interface ScheduledLaundryWindow extends LaundryWindowProposal {
  runId: string;
  status: "scheduled";
  scheduledAt: string;
}

export interface AgentNotification {
  id: string;
  runId: string;
  kind: WearCastNotificationDraft["kind"];
  severity: WearCastRiskSeverity;
  title: string;
  body: string;
  relatedOutfitId: string | null;
  relatedGarmentIds: string[];
  queuedAt: string;
  deliveredAt: string | null;
  deliveryStatus: "queued" | "delivered";
}

export interface OutfitRecovery {
  id: string;
  runId: string;
  atRiskOutfitId: string;
  fallbackOutfitId: string;
  activatedAt: string;
}

export interface AutonomyRunRecord {
  id: string;
  triggerId: string;
  committedAt: string;
  riskCount: number;
  laundryWindowCount: number;
  fallbackOutfitId: string | null;
}

export interface AutonomyState {
  runs: Record<string, AutonomyRunRecord>;
  laundryWindows: Record<string, ScheduledLaundryWindow>;
  notifications: Record<string, AgentNotification>;
  recoveries: Record<string, OutfitRecovery>;
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

export type ColourEvidenceDirection = "positive" | "negative";
export type ColourEvidenceAttribution = "user-attributed" | "outfit-inferred";

export interface ColourEvidence {
  id: string;
  colourFamily: string;
  exactHex: string;
  label: string;
  source: "confidence-check-in";
  direction: ColourEvidenceDirection;
  strength: number;
  attribution: ColourEvidenceAttribution;
  garmentId: string;
  outfitId: string;
  occurredAt: string;
}

export interface ColourPreferenceSignal {
  colourFamily: string;
  representativeHex: string;
  label: string;
  positiveEvidence: number;
  negativeEvidence: number;
  observations: number;
  score: number;
  certainty: number;
  lastObservedAt: string;
  userAttributedObservations: number;
}

export interface StyleMemory {
  feedbackCount: number;
  averageConfidence: number | null;
  signals: Record<string, PreferenceSignal>;
  colourEvidence: ColourEvidence[];
  colourPreferences: Record<string, ColourPreferenceSignal>;
}

export interface TwinState {
  wardrobeMode: WardrobeMode;
  userProfile: UserProfile;
  garments: Record<string, Garment>;
  outfits: Record<string, Outfit>;
  feedback: ConfidenceFeedback[];
  styleMemory: StyleMemory;
  styleProfile: StyleProfile;
  inspirationLooks: Record<string, LookDna>;
  autonomy: AutonomyState;
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
        reason: GarmentStateChangeReason;
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
      type: "ColourEvidenceRecorded";
      payload: { evidence: ColourEvidence };
    })
  | (EventEnvelope & {
      type: "GarmentAdded";
      payload: { garment: Garment };
    })
  | (EventEnvelope & {
      type: "GarmentUpdated";
      payload: { garment: Garment };
    })
  | (EventEnvelope & {
      type: "GarmentArchived";
      payload: { garmentId: string };
    })
  | (EventEnvelope & {
      type: "PersonalWardrobeActivated";
      payload: { retainedGarmentIds: string[] };
    })
  | (EventEnvelope & {
      type: "UserProfileUpdated";
      payload: { profile: UserProfile };
    })
  | (EventEnvelope & {
      type: "StyleProfileUpdated";
      payload: { profile: StyleProfile };
    })
  | (EventEnvelope & {
      type: "LookDnaCaptured";
      payload: { look: LookDna };
    })
  | (EventEnvelope & {
      type: "OutfitPlanned";
      payload: { outfit: Outfit };
    })
  | (EventEnvelope & {
      type: "AutonomyRunCommitted";
      payload: { run: AutonomyRunRecord };
    })
  | (EventEnvelope & {
      type: "LaundryWindowScheduled";
      payload: { window: ScheduledLaundryWindow };
    })
  | (EventEnvelope & {
      type: "OutfitRecoveryActivated";
      payload: { recovery: OutfitRecovery };
    })
  | (EventEnvelope & {
      type: "NotificationQueued";
      payload: { notification: AgentNotification };
    })
  | (EventEnvelope & {
      type: "NotificationDelivered";
      payload: { notificationId: string; deliveredAt: string };
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
