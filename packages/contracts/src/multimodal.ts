import type {
  BleachMethod,
  DryMethod,
  EvidenceValue,
  GarmentCareProfile,
  GarmentCategory,
  IronMethod,
  WashMethod,
} from "@yange/domain";

export const MULTIMODAL_CONTRACT_VERSION = "1.0" as const;

export type AnalysisMode = "garment" | "look-dna";
export type AnalysisImageKind = "garment" | "care-label" | "inspiration";

export interface AnalysisImageRef {
  assetId: string;
  kind: AnalysisImageKind;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
  width: number;
  height: number;
}

export interface MultimodalRequestV1 {
  contractVersion: typeof MULTIMODAL_CONTRACT_VERSION;
  requestId: string;
  mode: AnalysisMode;
  images: AnalysisImageRef[];
}

interface ResponseEnvelopeV1 {
  contractVersion: typeof MULTIMODAL_CONTRACT_VERSION;
  requestId: string;
  adapter: string;
  generatedAt: string;
  warnings: string[];
}

export interface GarmentAnalysisV1 extends ResponseEnvelopeV1 {
  mode: "garment";
  facts: {
    name: EvidenceValue<string>;
    category: EvidenceValue<GarmentCategory>;
    colour: EvidenceValue<string>;
    material: EvidenceValue<string>;
  };
  careProfile: GarmentCareProfile;
  suggestedWearPolicy: {
    postWearMode: "wash" | "rewearable" | "airing" | "available";
    maxWearsBeforeWash: number;
  };
}

export interface LookDnaAnalysisV1 extends ResponseEnvelopeV1 {
  mode: "look-dna";
  look: {
    name: string;
    palette: string[];
    silhouette: string;
    keyPieces: string[];
    layering: string[];
    stylingCues: string[];
    occasionCues: string[];
    confidence: number;
  };
}

export type MultimodalResponseV1 = GarmentAnalysisV1 | LookDnaAnalysisV1;

export interface MultimodalAnalyzer {
  analyze(request: MultimodalRequestV1): Promise<MultimodalResponseV1>;
}

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown, max = 12): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((entry) => typeof entry === "string" && entry.length <= 160)
  );
}

const provenances = new Set(["user-confirmed", "label-extracted", "ai-estimated"]);
const reviewStatuses = new Set(["confirmed", "needs-review"]);

function parseEvidence<T>(
  value: unknown,
  field: string,
  isValue: (candidate: unknown) => candidate is T,
): EvidenceValue<T> {
  if (!isRecord(value) || !isValue(value.value)) {
    throw new ContractValidationError(`${field} has an invalid value.`);
  }
  if (!provenances.has(String(value.provenance))) {
    throw new ContractValidationError(`${field} has invalid provenance.`);
  }
  if (!reviewStatuses.has(String(value.reviewStatus))) {
    throw new ContractValidationError(`${field} has an invalid review status.`);
  }
  if (
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    throw new ContractValidationError(`${field} confidence must be between 0 and 1.`);
  }
  if (value.provenance !== "user-confirmed" && value.reviewStatus === "confirmed") {
    throw new ContractValidationError(`${field} cannot be auto-confirmed.`);
  }
  return value as unknown as EvidenceValue<T>;
}

const garmentCategories = new Set<GarmentCategory>([
  "top",
  "bottom",
  "outerwear",
  "shoes",
  "accessory",
]);
const washMethods = new Set<WashMethod>([
  "machine-cold",
  "machine-warm",
  "hand-wash",
  "dry-clean",
  "unknown",
]);
const dryMethods = new Set<DryMethod>([
  "line-dry",
  "line-dry-shade",
  "flat-dry",
  "tumble-low",
  "unknown",
]);
const ironMethods = new Set<IronMethod>([
  "low",
  "medium",
  "high",
  "do-not-iron",
  "unknown",
]);
const bleachMethods = new Set<BleachMethod>([
  "allowed",
  "non-chlorine-only",
  "do-not-bleach",
  "unknown",
]);

function parseEnvelope(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new ContractValidationError("Response must be an object.");
  if (value.contractVersion !== MULTIMODAL_CONTRACT_VERSION) {
    throw new ContractValidationError("Unsupported multimodal contract version.");
  }
  if (typeof value.requestId !== "string" || !value.requestId) {
    throw new ContractValidationError("Response request ID is missing.");
  }
  if (typeof value.adapter !== "string" || !value.adapter) {
    throw new ContractValidationError("Response adapter identity is missing.");
  }
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new ContractValidationError("Response timestamp is invalid.");
  }
  if (!isStringArray(value.warnings, 10)) {
    throw new ContractValidationError("Response warnings are invalid.");
  }
}

export function parseMultimodalResponse(value: unknown): MultimodalResponseV1 {
  parseEnvelope(value);
  if (value.mode === "garment") {
    if (!isRecord(value.facts) || !isRecord(value.careProfile)) {
      throw new ContractValidationError("Garment facts or care profile are missing.");
    }
    const category = parseEvidence(
      value.facts.category,
      "Category",
      (candidate): candidate is GarmentCategory =>
        typeof candidate === "string" && garmentCategories.has(candidate as GarmentCategory),
    );
    const careProfile: GarmentCareProfile = {
      wash: parseEvidence(
        value.careProfile.wash,
        "Wash method",
        (candidate): candidate is WashMethod =>
          typeof candidate === "string" && washMethods.has(candidate as WashMethod),
      ),
      dry: parseEvidence(
        value.careProfile.dry,
        "Dry method",
        (candidate): candidate is DryMethod =>
          typeof candidate === "string" && dryMethods.has(candidate as DryMethod),
      ),
      iron: parseEvidence(
        value.careProfile.iron,
        "Iron method",
        (candidate): candidate is IronMethod =>
          typeof candidate === "string" && ironMethods.has(candidate as IronMethod),
      ),
      bleach: parseEvidence(
        value.careProfile.bleach,
        "Bleach method",
        (candidate): candidate is BleachMethod =>
          typeof candidate === "string" && bleachMethods.has(candidate as BleachMethod),
      ),
      notes: parseEvidence(value.careProfile.notes, "Care notes", isStringArray),
    };
    if (!isRecord(value.suggestedWearPolicy)) {
      throw new ContractValidationError("Suggested wear policy is missing.");
    }
    const postWearModes = new Set(["wash", "rewearable", "airing", "available"]);
    if (
      !postWearModes.has(String(value.suggestedWearPolicy.postWearMode)) ||
      !Number.isInteger(value.suggestedWearPolicy.maxWearsBeforeWash) ||
      Number(value.suggestedWearPolicy.maxWearsBeforeWash) < 1 ||
      Number(value.suggestedWearPolicy.maxWearsBeforeWash) > 30
    ) {
      throw new ContractValidationError("Suggested wear policy is invalid.");
    }

    return {
      ...(value as unknown as GarmentAnalysisV1),
      facts: {
        name: parseEvidence(value.facts.name, "Name", (entry): entry is string => typeof entry === "string" && entry.length <= 80),
        category,
        colour: parseEvidence(value.facts.colour, "Colour", (entry): entry is string => typeof entry === "string" && entry.length <= 80),
        material: parseEvidence(value.facts.material, "Material", (entry): entry is string => typeof entry === "string" && entry.length <= 120),
      },
      careProfile,
    };
  }

  if (value.mode === "look-dna") {
    if (!isRecord(value.look)) throw new ContractValidationError("Look DNA is missing.");
    if (
      typeof value.look.name !== "string" ||
      typeof value.look.silhouette !== "string" ||
      !isStringArray(value.look.palette, 6) ||
      value.look.palette.length === 0 ||
      !value.look.palette.every((colour) => /^#[0-9a-f]{6}$/i.test(colour)) ||
      !isStringArray(value.look.keyPieces) ||
      !isStringArray(value.look.layering) ||
      !isStringArray(value.look.stylingCues) ||
      !isStringArray(value.look.occasionCues) ||
      typeof value.look.confidence !== "number" ||
      value.look.confidence < 0 ||
      value.look.confidence > 1
    ) {
      throw new ContractValidationError("Look DNA payload is invalid.");
    }
    return value as unknown as LookDnaAnalysisV1;
  }

  throw new ContractValidationError("Response mode is unsupported.");
}
