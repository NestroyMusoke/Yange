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
          const reservation = event.payload.reason === "outfit-reservation";
          const laundryQueued = event.payload.reason === "laundry-queued";
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: reservation
              ? "Outfit dependency reserved"
              : laundryQueued
                ? "Laundry basket updated"
                : garment?.name ?? "Garment assessed",
            detail: reservation
              ? `${garment?.name ?? "Garment"} is protected for a planned outfit.`
              : laundryQueued
                ? `${garment?.name ?? "Garment"} entered the safe-clustering flow.`
                : stateLabels[event.payload.to] ?? `changed to ${event.payload.to}`,
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
        case "ColourEvidenceRecorded": {
          const evidence = event.payload.evidence;
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: `${evidence.label} colour evidence recorded`,
            detail: `${evidence.direction === "positive" ? "Positive" : "Negative"} ${evidence.attribution === "user-attributed" ? "user-attributed" : "outfit-inferred"} evidence was added at ${Math.round(evidence.strength * 100)}% strength.`,
            tone: evidence.direction === "positive" ? "positive" : "neutral",
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
        case "GarmentUpdated":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: `${event.payload.garment.name} updated`,
            detail: "The confirmed garment facts and care preferences were saved.",
            tone: "neutral",
          };
        case "GarmentArchived":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Wardrobe piece archived",
            detail: "The piece was removed from future outfit and laundry decisions.",
            tone: "neutral",
          };
        case "PersonalWardrobeActivated":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Personal wardrobe started",
            detail: `${event.payload.retainedGarmentIds.length} captured piece${event.payload.retainedGarmentIds.length === 1 ? "" : "s"} retained.`,
            tone: "positive",
          };
        case "UserProfileUpdated":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Wardrobe context updated",
            detail: `${event.payload.profile.displayName}'s wardrobe is set to ${event.payload.profile.locationLabel}.`,
            tone: "neutral",
          };
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
        case "OutfitPlanned": {
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Outfit plan committed",
            detail: `${event.payload.outfit.name} reserved ${event.payload.outfit.dependencies.length} real wardrobe dependencies at ${event.payload.outfit.personalMatch}% Personal Match.`,
            tone: "positive",
          };
        }
        case "AutonomyRunCommitted":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "WearCast acted autonomously",
            detail: `${event.payload.run.riskCount} risk signal${event.payload.run.riskCount === 1 ? "" : "s"} produced ${event.payload.run.laundryWindowCount} laundry intervention${event.payload.run.laundryWindowCount === 1 ? "" : "s"}.`,
            tone: "positive",
          };
        case "LaundryWindowScheduled":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Laundry opportunity scheduled",
            detail: `${event.payload.window.garmentIds.length} piece${event.payload.window.garmentIds.length === 1 ? "" : "s"} matched a ${event.payload.window.suitabilityScore}% drying window.`,
            tone: "positive",
          };
        case "OutfitRecoveryActivated": {
          const fallback = state.outfits[event.payload.recovery.fallbackOutfitId];
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Fallback outfit activated",
            detail: `${fallback?.name ?? "A verified fallback"} now protects the endangered outfit commitment.`,
            tone: "positive",
          };
        }
        case "NotificationQueued":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Notification queued",
            detail: event.payload.notification.title,
            tone: event.payload.notification.severity === "critical" ? "warning" : "neutral",
          };
        case "NotificationDelivered":
          return {
            id: event.id,
            occurredAt: event.occurredAt,
            title: "Notification delivered",
            detail: state.autonomy.notifications[event.payload.notificationId]?.title ?? "WearCast update delivered.",
            tone: "positive",
          };
      }
    });
}
