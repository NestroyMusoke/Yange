export const MIRROR_CONTRACT_VERSION = "1.0" as const;

export const MIRROR_MODEL_ID = "virtual-try-on-001" as const;

export type MirrorGarmentCategory = "top" | "outerwear";
export type MirrorJobStatus =
  | "queued"
  | "generating"
  | "ready"
  | "blocked"
  | "failed"
  | "deleted";

export interface MirrorImageRefV1 {
  assetId: string;
  mimeType: "image/jpeg" | "image/png";
  byteLength: number;
  width: number;
  height: number;
}

export interface MirrorGarmentRefV1 {
  garmentId: string;
  assetId: string;
  name: string;
  category: MirrorGarmentCategory;
}

export interface MirrorConsentV1 {
  adultConfirmed: true;
  imageRightsConfirmed: true;
  privateProcessingAccepted: true;
  retention: "delete-person-after-generation";
  acceptedAt: string;
}

export interface CreateMirrorJobRequestV1 {
  contractVersion: typeof MIRROR_CONTRACT_VERSION;
  requestId: string;
  outfitCandidateId: string;
  personImage: MirrorImageRefV1;
  garment: MirrorGarmentRefV1;
  consent: MirrorConsentV1;
  requestedAt: string;
}

export type MirrorFailureCode =
  | "SAFETY_BLOCKED"
  | "INPUT_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "OUTPUT_INVALID"
  | "RATE_LIMITED"
  | "UNKNOWN";

export interface MirrorJobV1 {
  contractVersion: typeof MIRROR_CONTRACT_VERSION;
  id: string;
  requestId: string;
  outfitCandidateId: string;
  garment: MirrorGarmentRefV1;
  personAssetId: string;
  resultAssetId: string | null;
  status: MirrorJobStatus;
  model: typeof MIRROR_MODEL_ID;
  processingRegion: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  personDeletedAt: string | null;
  cached: boolean;
  attempts: number;
  failure: { code: MirrorFailureCode; message: string } | null;
  notices: string[];
}

export interface MirrorJobResponseV1 {
  job: MirrorJobV1;
  resultUrl: string | null;
  resultUrlExpiresAt: string | null;
}

export class MirrorContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MirrorContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown, max = 200): value is string {
  return typeof value === "string" && new RegExp(`^[a-zA-Z0-9:_-]{1,${max}}$`).test(value);
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseCreateMirrorJobRequest(value: unknown): CreateMirrorJobRequestV1 {
  if (!isRecord(value) || value.contractVersion !== MIRROR_CONTRACT_VERSION) {
    throw new MirrorContractError("Unsupported Mirror contract version.");
  }
  if (!validId(value.requestId) || !validId(value.outfitCandidateId)) {
    throw new MirrorContractError("Mirror request identity is invalid.");
  }
  if (!validIso(value.requestedAt)) {
    throw new MirrorContractError("Mirror request timestamp is invalid.");
  }
  if (!isRecord(value.personImage)) {
    throw new MirrorContractError("A person image is required.");
  }
  const person = value.personImage;
  if (
    !validId(person.assetId, 160) ||
    (person.mimeType !== "image/jpeg" && person.mimeType !== "image/png") ||
    !Number.isInteger(person.byteLength) || Number(person.byteLength) < 1 || Number(person.byteLength) > 7 * 1024 * 1024 ||
    !Number.isInteger(person.width) || Number(person.width) < 320 || Number(person.width) > 8_192 ||
    !Number.isInteger(person.height) || Number(person.height) < 320 || Number(person.height) > 8_192
  ) {
    throw new MirrorContractError("The person image is not compatible with Yange Mirror.");
  }
  if (!isRecord(value.garment)) {
    throw new MirrorContractError("A wardrobe garment is required.");
  }
  const garment = value.garment;
  if (
    !validId(garment.garmentId, 160) ||
    !validId(garment.assetId, 160) ||
    typeof garment.name !== "string" || !garment.name.trim() || garment.name.length > 100 ||
    (garment.category !== "top" && garment.category !== "outerwear")
  ) {
    throw new MirrorContractError("The selected garment is not supported by Yange Mirror.");
  }
  if (!isRecord(value.consent)) {
    throw new MirrorContractError("Mirror consent is required.");
  }
  const consent = value.consent;
  if (
    consent.adultConfirmed !== true ||
    consent.imageRightsConfirmed !== true ||
    consent.privateProcessingAccepted !== true ||
    consent.retention !== "delete-person-after-generation" ||
    !validIso(consent.acceptedAt)
  ) {
    throw new MirrorContractError("All Mirror consent checks must be accepted.");
  }
  return value as unknown as CreateMirrorJobRequestV1;
}
