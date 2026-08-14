import { applyEvent } from "./projection";
import { isGarmentUsable } from "./readiness";
import type {
  DomainEvent,
  Garment,
  GarmentState,
  PostWearMode,
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

