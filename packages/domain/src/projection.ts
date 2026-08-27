import type {
  ColourEvidence,
  ColourPreferenceSignal,
  DomainEvent,
  PreferenceSignal,
  TwinState,
} from "./types";

function decayed(value: number, from: string, to: string): number {
  const days = Math.max(0, (Date.parse(to) - Date.parse(from)) / 86_400_000);
  return value * Math.pow(0.985, days);
}

function updatedColourPreference(
  existing: ColourPreferenceSignal | undefined,
  evidence: ColourEvidence,
): ColourPreferenceSignal {
  const positive = existing
    ? decayed(existing.positiveEvidence, existing.lastObservedAt, evidence.occurredAt)
    : 0;
  const negative = existing
    ? decayed(existing.negativeEvidence, existing.lastObservedAt, evidence.occurredAt)
    : 0;
  const positiveEvidence = positive + (evidence.direction === "positive" ? evidence.strength : 0);
  const negativeEvidence = negative + (evidence.direction === "negative" ? evidence.strength : 0);
  const observations = (existing?.observations ?? 0) + 1;
  const evidenceMass = positiveEvidence + negativeEvidence;
  return {
    colourFamily: evidence.colourFamily,
    representativeHex: evidence.exactHex,
    label: evidence.label,
    positiveEvidence,
    negativeEvidence,
    observations,
    score: (positiveEvidence + 1) / (evidenceMass + 2),
    certainty: Math.min(1, evidenceMass / 2.4),
    lastObservedAt: evidence.occurredAt,
    userAttributedObservations: (existing?.userAttributedObservations ?? 0)
      + (evidence.attribution === "user-attributed" ? 1 : 0),
  };
}

function updatedSignal(
  existing: PreferenceSignal | undefined,
  key: string,
  rating: number,
): PreferenceSignal {
  const signal = existing ?? {
    key,
    positiveEvidence: 0,
    negativeEvidence: 0,
    observations: 0,
    score: 0.5,
    certainty: 0,
  };
  const sentiment = (rating - 3) / 2;
  const positiveEvidence = signal.positiveEvidence + Math.max(sentiment, 0);
  const negativeEvidence = signal.negativeEvidence + Math.max(-sentiment, 0);
  const observations = signal.observations + 1;
  const score = (positiveEvidence + 1) / (positiveEvidence + negativeEvidence + 2);

  return {
    ...signal,
    positiveEvidence,
    negativeEvidence,
    observations,
    score,
    certainty: Math.min(1, observations / 5),
  };
}

export function applyEvent(state: TwinState, event: DomainEvent): TwinState {
  switch (event.type) {
    case "OutfitWorn": {
      const outfit = state.outfits[event.payload.outfitId];
      if (!outfit) return state;
      return {
        ...state,
        outfits: {
          ...state.outfits,
          [outfit.id]: { ...outfit, status: "worn" },
        },
      };
    }
    case "GarmentStateChanged": {
      const garment = state.garments[event.payload.garmentId];
      if (!garment) return state;
      return {
        ...state,
        garments: {
          ...state.garments,
          [garment.id]: {
            ...garment,
            state: event.payload.to,
            wearsSinceWash: event.payload.wearsSinceWash,
          },
        },
      };
    }
    case "ConfidenceRecorded": {
      const outfit = state.outfits[event.payload.outfitId];
      if (!outfit) return state;
      const feedback = {
        outfitId: outfit.id,
        value: event.payload.value,
        tags: event.payload.tags,
        recordedAt: event.occurredAt,
      };
      const nextCount = state.styleMemory.feedbackCount + 1;
      const previousTotal =
        (state.styleMemory.averageConfidence ?? 0) * state.styleMemory.feedbackCount;
      const signals = { ...state.styleMemory.signals };
      for (const key of outfit.styleSignals) {
        signals[key] = updatedSignal(signals[key], key, event.payload.value);
      }

      return {
        ...state,
        feedback: [...state.feedback, feedback],
        styleMemory: {
          ...state.styleMemory,
          feedbackCount: nextCount,
          averageConfidence: (previousTotal + event.payload.value) / nextCount,
          signals,
        },
      };
    }
    case "ColourEvidenceRecorded": {
      const evidence = structuredClone(event.payload.evidence);
      const existing = state.styleMemory.colourPreferences?.[evidence.colourFamily];
      return {
        ...state,
        styleMemory: {
          ...state.styleMemory,
          colourEvidence: [...(state.styleMemory.colourEvidence ?? []), evidence],
          colourPreferences: {
            ...(state.styleMemory.colourPreferences ?? {}),
            [evidence.colourFamily]: updatedColourPreference(existing, evidence),
          },
        },
      };
    }
    case "OutfitRiskDetected":
      return state;
    case "GarmentAdded":
      return {
        ...state,
        garments: {
          ...state.garments,
          [event.payload.garment.id]: structuredClone(event.payload.garment),
        },
      };
    case "GarmentUpdated":
      return {
        ...state,
        garments: {
          ...state.garments,
          [event.payload.garment.id]: structuredClone(event.payload.garment),
        },
      };
    case "GarmentArchived": {
      const garment = state.garments[event.payload.garmentId];
      if (!garment) return state;
      return {
        ...state,
        garments: {
          ...state.garments,
          [garment.id]: { ...garment, archived: true },
        },
      };
    }
    case "PersonalWardrobeActivated": {
      const garments = Object.fromEntries(
        Object.entries(state.garments).filter(([, garment]) => garment.source === "user-added"),
      );
      const garmentIds = new Set(Object.keys(garments));
      const outfits = Object.fromEntries(
        Object.entries(state.outfits).filter(([, outfit]) =>
          outfit.garmentIds.length > 0 && outfit.garmentIds.every((id) => garmentIds.has(id)),
        ),
      );
      return { ...state, wardrobeMode: "personal", garments, outfits };
    }
    case "UserProfileUpdated":
      return { ...state, userProfile: structuredClone(event.payload.profile) };
    case "StyleProfileUpdated":
      return {
        ...state,
        styleProfile: structuredClone(event.payload.profile),
      };
    case "LookDnaCaptured":
      return {
        ...state,
        inspirationLooks: {
          ...state.inspirationLooks,
          [event.payload.look.id]: structuredClone(event.payload.look),
        },
      };
    case "OutfitPlanned":
      return {
        ...state,
        outfits: {
          ...state.outfits,
          [event.payload.outfit.id]: structuredClone(event.payload.outfit),
        },
      };
    case "AutonomyRunCommitted":
      return {
        ...state,
        autonomy: {
          ...state.autonomy,
          runs: {
            ...state.autonomy.runs,
            [event.payload.run.id]: structuredClone(event.payload.run),
          },
        },
      };
    case "LaundryWindowScheduled":
      return {
        ...state,
        autonomy: {
          ...state.autonomy,
          laundryWindows: {
            ...state.autonomy.laundryWindows,
            [event.payload.window.id]: structuredClone(event.payload.window),
          },
        },
      };
    case "OutfitRecoveryActivated":
      return {
        ...state,
        autonomy: {
          ...state.autonomy,
          recoveries: {
            ...state.autonomy.recoveries,
            [event.payload.recovery.id]: structuredClone(event.payload.recovery),
          },
        },
      };
    case "NotificationQueued":
      return {
        ...state,
        autonomy: {
          ...state.autonomy,
          notifications: {
            ...state.autonomy.notifications,
            [event.payload.notification.id]: structuredClone(event.payload.notification),
          },
        },
      };
    case "NotificationDelivered": {
      const notification = state.autonomy.notifications[event.payload.notificationId];
      if (!notification) return state;
      return {
        ...state,
        autonomy: {
          ...state.autonomy,
          notifications: {
            ...state.autonomy.notifications,
            [notification.id]: {
              ...notification,
              deliveryStatus: "delivered",
              deliveredAt: event.payload.deliveredAt,
            },
          },
        },
      };
    }
  }
}

export function replayEvents(seed: TwinState, events: DomainEvent[]): TwinState {
  return events.reduce(applyEvent, seed);
}
