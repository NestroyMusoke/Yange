import { applyEvent } from "./projection";
import { isGarmentUsable } from "./readiness";
import type {
  DomainEvent,
  EvidenceMeta,
  Garment,
  GarmentState,
  LookDna,
  PostWearMode,
  StyleProfile,
  TwinState,
} from "./types";

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

function eventId(operationId: string, suffix: string): string {
  return `${operationId}:${suffix}`;
}

function targetState(garment: Garment): GarmentState {
  const nextWearCount = garment.wearsSinceWash + 1;
  if (nextWearCount >= garment.wearPolicy.maxWearsBeforeWash) return "laundry";

  const targetByPolicy: Record<PostWearMode, GarmentState> = {
    wash: "laundry",
    rewearable: "rewearable",
    airing: "airing",
    available: "available",
  };
  return targetByPolicy[garment.wearPolicy.postWearMode];
}

function hasOperation(events: DomainEvent[], operationId: string): boolean {
  return events.some((event) => event.operationId === operationId);
}

function validateEvidence(meta: EvidenceMeta, field: string): void {
  if (!Number.isFinite(meta.confidence) || meta.confidence < 0 || meta.confidence > 1) {
    throw new DomainError(`${field} confidence must be between 0 and 1.`);
  }
  if (meta.provenance !== "user-confirmed" && meta.reviewStatus === "confirmed") {
    throw new DomainError(`${field} cannot be confirmed without user review.`);
  }
}

function validateGarment(garment: Garment): void {
  if (!garment.id.trim()) throw new DomainError("Garment ID is required.");
  if (!garment.name.trim()) throw new DomainError("Garment name is required.");
  if (garment.name.trim().length > 80) {
    throw new DomainError("Garment name must be 80 characters or fewer.");
  }
  if (!garment.colour.trim()) throw new DomainError("Garment colour is required.");
  if (!garment.material.trim()) throw new DomainError("Garment material is required.");

  for (const [field, meta] of Object.entries(garment.provenance)) {
    validateEvidence(meta, field);
  }
  validateEvidence(garment.careProfile.wash, "Wash method");
  validateEvidence(garment.careProfile.dry, "Dry method");
  validateEvidence(garment.careProfile.iron, "Iron method");
  validateEvidence(garment.careProfile.bleach, "Bleach method");
  validateEvidence(garment.careProfile.notes, "Care notes");
}

export interface MarkOutfitWornInput {
  outfitId: string;
  wearContext: string;
  operationId: string;
  occurredAt: string;
}

export function markOutfitWorn(
  state: TwinState,
  ledger: DomainEvent[],
  input: MarkOutfitWornInput,
): DomainEvent[] {
  if (hasOperation(ledger, input.operationId)) return [];
  const outfit = state.outfits[input.outfitId];
  if (!outfit) throw new DomainError("Outfit not found.");
  if (outfit.status === "worn") throw new DomainError("This outfit is already worn.");

  const events: DomainEvent[] = [
    {
      id: eventId(input.operationId, "outfit-worn"),
      operationId: input.operationId,
      occurredAt: input.occurredAt,
      type: "OutfitWorn",
      payload: { outfitId: outfit.id, wearContext: input.wearContext },
    },
  ];

  outfit.garmentIds.forEach((garmentId, index) => {
    const garment = state.garments[garmentId];
    if (!garment) throw new DomainError(`Garment ${garmentId} not found.`);
    if (!isGarmentUsable(garment.state)) {
      throw new DomainError(`${garment.name} is not currently wearable.`);
    }
    events.push({
      id: eventId(input.operationId, `garment-${index}`),
      operationId: input.operationId,
      occurredAt: input.occurredAt,
      type: "GarmentStateChanged",
      payload: {
        garmentId,
        from: garment.state,
        to: targetState(garment),
        wearsSinceWash: garment.wearsSinceWash + 1,
        reason: garment.wearPolicy.postWearMode,
      },
    });
  });

  const projected = events.reduce(applyEvent, state);
  for (const futureOutfit of Object.values(projected.outfits)) {
    if (futureOutfit.status !== "planned") continue;
    const unavailableGarmentIds = futureOutfit.garmentIds.filter(
      (id) =>
        !projected.garments[id] ||
        !isGarmentUsable(projected.garments[id].state),
    );
    if (unavailableGarmentIds.length) {
      events.push({
        id: eventId(input.operationId, `risk-${futureOutfit.id}`),
        operationId: input.operationId,
        occurredAt: input.occurredAt,
        type: "OutfitRiskDetected",
        payload: { outfitId: futureOutfit.id, unavailableGarmentIds },
      });
    }
  }

  return events;
}

export interface RecordConfidenceInput {
  outfitId: string;
  value: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  operationId: string;
  occurredAt: string;
}

export function recordConfidence(
  state: TwinState,
  ledger: DomainEvent[],
  input: RecordConfidenceInput,
): DomainEvent[] {
  if (hasOperation(ledger, input.operationId)) return [];
  const outfit = state.outfits[input.outfitId];
  if (!outfit) throw new DomainError("Outfit not found.");
  if (outfit.status !== "worn") {
    throw new DomainError("Confidence can only be recorded after wearing an outfit.");
  }
  if (state.feedback.some((feedback) => feedback.outfitId === outfit.id)) {
    throw new DomainError("Confidence has already been recorded for this outfit.");
  }

  return [
    {
      id: eventId(input.operationId, "confidence"),
      operationId: input.operationId,
      occurredAt: input.occurredAt,
      type: "ConfidenceRecorded",
      payload: {
        outfitId: outfit.id,
        value: input.value,
        tags: input.tags,
      },
    },
  ];
}

export interface AddGarmentInput {
  garment: Garment;
  operationId: string;
  occurredAt: string;
}

export function addGarment(
  state: TwinState,
  ledger: DomainEvent[],
  input: AddGarmentInput,
): DomainEvent[] {
  if (hasOperation(ledger, input.operationId)) return [];
  validateGarment(input.garment);
  if (state.garments[input.garment.id]) {
    throw new DomainError("A garment with this ID already exists.");
  }
  if (input.garment.source !== "user-added") {
    throw new DomainError("Only user-added garments can enter through onboarding.");
  }

  return [
    {
      id: eventId(input.operationId, "garment-added"),
      operationId: input.operationId,
      occurredAt: input.occurredAt,
      type: "GarmentAdded",
      payload: { garment: structuredClone(input.garment) },
    },
  ];
}

export interface UpdateStyleProfileInput {
  profile: StyleProfile;
  operationId: string;
  occurredAt: string;
}

export function updateStyleProfile(
  ledger: DomainEvent[],
  input: UpdateStyleProfileInput,
): DomainEvent[] {
  if (hasOperation(ledger, input.operationId)) return [];
  const { profile } = input;
  if (
    profile.heightCm !== null &&
    (!Number.isFinite(profile.heightCm) || profile.heightCm < 90 || profile.heightCm > 250)
  ) {
    throw new DomainError("Height must be between 90 and 250 centimetres.");
  }
  if (profile.preferredColours.length > 12 || profile.avoidedColours.length > 12) {
    throw new DomainError("Choose no more than 12 colours in each list.");
  }
  if (profile.styleWords.length > 8) {
    throw new DomainError("Choose no more than 8 style words.");
  }
  if (profile.styleWords.some((word) => !word.trim() || word.trim().length > 24)) {
    throw new DomainError("Style words must be 1 to 24 characters.");
  }

  return [
    {
      id: eventId(input.operationId, "style-profile"),
      operationId: input.operationId,
      occurredAt: input.occurredAt,
      type: "StyleProfileUpdated",
      payload: { profile: structuredClone(profile) },
    },
  ];
}

export interface CaptureLookDnaInput {
  look: LookDna;
  operationId: string;
  occurredAt: string;
}

export function captureLookDna(
  state: TwinState,
  ledger: DomainEvent[],
  input: CaptureLookDnaInput,
): DomainEvent[] {
  if (hasOperation(ledger, input.operationId)) return [];
  if (state.inspirationLooks[input.look.id]) {
    throw new DomainError("This inspiration look has already been saved.");
  }
  if (!input.look.sourceAssetId.trim()) {
    throw new DomainError("An inspiration image is required.");
  }
  if (
    !Number.isFinite(input.look.confidence) ||
    input.look.confidence < 0 ||
    input.look.confidence > 1
  ) {
    throw new DomainError("Look DNA confidence must be between 0 and 1.");
  }
  if (!input.look.palette.length || input.look.palette.length > 6) {
    throw new DomainError("Look DNA requires between 1 and 6 palette colours.");
  }

  return [
    {
      id: eventId(input.operationId, "look-dna"),
      operationId: input.operationId,
      occurredAt: input.occurredAt,
      type: "LookDnaCaptured",
      payload: { look: structuredClone(input.look) },
    },
  ];
}
