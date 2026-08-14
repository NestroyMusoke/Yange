import type { ActivityItem, DomainEvent, TwinState } from "./types";

export function deriveActivity(
  events: DomainEvent[],
  state: TwinState,
): ActivityItem[] {
  return [...events]
    .reverse()
    .map((event): ActivityItem => {
      switch (event.type) {
        case "OutfitWorn": {
          const outfit = state.outfits[event.payload.outfitId];
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Outfit marked worn",
            detail: `${outfit?.name ?? "Outfit"} entered the care-assessment flow.`,
            tone: "neutral",
          };
        }
        case "GarmentStateChanged": {
          const garment = state.garments[event.payload.garmentId];
          const stateLabels: Record<string, string> = {
            laundry: "moved to laundry",
            rewearable: "kept available for another wear",
            airing: "sent for airing",
            available: "returned to availability",
          };
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: garment?.name ?? "Garment assessed",
            detail: stateLabels[event.payload.to] ?? `changed to ${event.payload.to}`,
            tone: event.payload.to === "laundry" ? "warning" : "positive",
          };
        }
        case "OutfitRiskDetected": {
          const outfit = state.outfits[event.payload.outfitId];
          const garments = event.payload.unavailableGarmentIds
            .map((id) => state.garments[id]?.name ?? id)
            .join(", ");
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Future outfit at risk",
            detail: `${outfit?.name ?? "A planned outfit"} depends on ${garments}.`,
            tone: "warning",
          };
        }
        case "ConfidenceRecorded": {
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Style memory updated",
            detail: `Confidence ${event.payload.value}/5 was connected to this outfit's colour and silhouette signals.`,
            tone: "positive",
          };
        }
        case "GarmentAdded": {
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Wardrobe learned a new piece",
            detail: `${event.payload.garment.name} was added with field-level evidence and care provenance.`,
            tone: "positive",
          };
        }
        case "StyleProfileUpdated": {
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Style DNA refined",
            detail: "User-controlled colour, fit, height, and comfort preferences were saved.",
            tone: "positive",
          };
        }
        case "LookDnaCaptured": {
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Inspiration decoded",
            detail: `${event.payload.look.name} became reusable Look DNA without copying the person in the image.`,
            tone: "neutral",
          };
        }
      }
    });
}
