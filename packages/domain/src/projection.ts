import type {
  DomainEvent,
  PreferenceSignal,
  TwinState,
} from "./types";

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
          feedbackCount: nextCount,
          averageConfidence: (previousTotal + event.payload.value) / nextCount,
          signals,
        },
      };
    }
    case "OutfitRiskDetected":
      return state;
  }
}

export function replayEvents(seed: TwinState, events: DomainEvent[]): TwinState {
  return events.reduce(applyEvent, seed);
}

