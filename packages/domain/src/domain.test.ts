import { describe, expect, it } from "vitest";
import {
  calculateReadiness,
  createSeedState,
  markOutfitWorn,
  recordConfidence,
  replayEvents,
} from "./index";

const now = "2026-08-14T09:00:00.000Z";

describe("Wardrobe Digital Twin", () => {
  it("replays wear events into deterministic garment states", () => {
    const seed = createSeedState();
    const events = markOutfitWorn(seed, [], {
      outfitId: "today-city-calm",
      wearContext: "normal",
      operationId: "wear-1",
      occurredAt: now,
    });
    const projected = replayEvents(seed, events);

    expect(projected.garments["cream-blouse"].state).toBe("laundry");
    expect(projected.garments["chocolate-trousers"].state).toBe("rewearable");
    expect(projected.garments["olive-jacket"].state).toBe("airing");
    expect(projected.garments["gold-earrings"].state).toBe("available");
    expect(replayEvents(createSeedState(), events)).toEqual(projected);
  });

  it("detects the planned Friday outfit becoming unavailable", () => {
    const seed = createSeedState();
    const before = calculateReadiness(seed);
    const events = markOutfitWorn(seed, [], {
      outfitId: "today-city-calm",
      wearContext: "normal",
      operationId: "wear-2",
      occurredAt: now,
    });
    const projected = replayEvents(seed, events);
    const after = calculateReadiness(projected);

    expect(events.some((event) => event.type === "OutfitRiskDetected")).toBe(true);
    expect(after.atRiskOutfitIds).toContain("friday-rooftop");
    expect(after.score).toBeLessThan(before.score);
  });

  it("rejects duplicate wear and preserves idempotency", () => {
    const seed = createSeedState();
    const first = markOutfitWorn(seed, [], {
      outfitId: "today-city-calm",
      wearContext: "normal",
      operationId: "wear-3",
      occurredAt: now,
    });
    const projected = replayEvents(seed, first);

    expect(
      markOutfitWorn(projected, first, {
        outfitId: "today-city-calm",
        wearContext: "normal",
        operationId: "wear-3",
        occurredAt: now,
      }),
    ).toEqual([]);
    expect(() =>
      markOutfitWorn(projected, first, {
        outfitId: "today-city-calm",
        wearContext: "normal",
        operationId: "wear-4",
        occurredAt: now,
      }),
    ).toThrow("already worn");
  });

  it("learns contextual style signals from a confidence check-in", () => {
    const seed = createSeedState();
    const wearEvents = markOutfitWorn(seed, [], {
      outfitId: "today-city-calm",
      wearContext: "normal",
      operationId: "wear-5",
      occurredAt: now,
    });
    const worn = replayEvents(seed, wearEvents);
    const confidenceEvents = recordConfidence(worn, wearEvents, {
      outfitId: "today-city-calm",
      value: 5,
      tags: ["loved-colour", "comfortable"],
      operationId: "confidence-1",
      occurredAt: now,
    });
    const learned = replayEvents(worn, confidenceEvents);

    expect(learned.styleMemory.feedbackCount).toBe(1);
    expect(learned.styleMemory.averageConfidence).toBe(5);
    expect(learned.styleMemory.signals["warm-neutral"].score).toBeGreaterThan(0.5);
  });

  it("does not accept confidence feedback before wear", () => {
    expect(() =>
      recordConfidence(createSeedState(), [], {
        outfitId: "today-city-calm",
        value: 4,
        tags: [],
        operationId: "confidence-early",
        occurredAt: now,
      }),
    ).toThrow("only be recorded after wearing");
  });
});

