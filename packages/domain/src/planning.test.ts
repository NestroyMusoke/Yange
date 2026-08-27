import { describe, expect, it } from "vitest";
import type { PlanningContext } from "./types";
import {
  createSeedState,
  generateOutfitCandidates,
  planOutfit,
  replayEvents,
} from "./index";

const context: PlanningContext = {
  version: 1,
  weather: {
    source: "manual-weather-v1",
    location: "Kampala",
    observedAt: "2026-08-14T09:00:00.000Z",
    temperatureC: 25,
    precipitationProbability: 45,
    condition: "showers",
  },
  calendar: {
    source: "manual-calendar-v1",
    eventId: "rooftop-1",
    title: "Rooftop dinner",
    startsAt: "2026-08-14T16:00:00.000Z",
    occasion: "dinner",
    dressCode: "polished",
    notes: "Covered terrace",
  },
  inspirationLookId: null,
};
const occurredAt = "2026-08-14T09:05:00.000Z";

describe("deterministic outfit intelligence", () => {
  it("generates reproducible ranked candidates with auditable factor totals", () => {
    const state = createSeedState();
    const first = generateOutfitCandidates(state, context, 6);
    const second = generateOutfitCandidates(createSeedState(), structuredClone(context), 6);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(2);
    expect(first[0].personalMatch).toBeGreaterThanOrEqual(first[1].personalMatch);
    expect(first[0].scoreBreakdown.reduce((sum, factor) => sum + factor.weight, 0)).toBe(100);
    expect(Math.round(first[0].scoreBreakdown.reduce((sum, factor) => sum + factor.weightedPoints, 0))).toBe(
      first[0].personalMatch,
    );
  });

  it("excludes laundry, airing, drying, and reserved garments", () => {
    const state = createSeedState();
    state.garments["cream-blouse"].state = "laundry";
    state.garments["ivory-knit"].state = "airing";
    state.garments["indigo-shirt"].state = "reserved";
    state.garments["terracotta-skirt"].state = "drying";

    const candidates = generateOutfitCandidates(state, context);
    expect(candidates).toEqual([]);
  });

  it("excludes archived pieces and records non-judgmental proportion evidence", () => {
    const state = createSeedState();
    state.garments["cream-blouse"].archived = true;
    state.styleProfile.heightCm = 154;
    const candidates = generateOutfitCandidates(state, context, 6);
    expect(candidates.every((candidate) => !candidate.garmentIds.includes("cream-blouse"))).toBe(true);
    const style = candidates[0].scoreBreakdown.find((factor) => factor.key === "style-memory");
    expect(style?.evidence).toContain("proportion:height:154");
    expect(style?.detail).toContain("Height only tunes length and layering relationships");
  });

  it("commits one planned outfit and reserves every dependency idempotently", () => {
    const state = createSeedState();
    const candidate = generateOutfitCandidates(state, context, 1)[0];
    const events = planOutfit(state, [], {
      candidate,
      operationId: "plan-1",
      occurredAt,
    });
    const projected = replayEvents(state, events);

    expect(events.filter((event) => event.type === "OutfitPlanned")).toHaveLength(1);
    expect(projected.outfits[`planned-${candidate.id}`].personalMatch).toBe(candidate.personalMatch);
    expect(candidate.garmentIds.every((id) => projected.garments[id].state === "reserved")).toBe(true);
    expect(
      planOutfit(projected, events, {
        candidate,
        operationId: "plan-1",
        occurredAt,
      }),
    ).toEqual([]);
  });

  it("rejects a candidate whose deterministic score was altered", () => {
    const state = createSeedState();
    const candidate = generateOutfitCandidates(state, context, 1)[0];
    expect(() =>
      planOutfit(state, [], {
        candidate: { ...candidate, personalMatch: candidate.personalMatch + 1 },
        operationId: "plan-unsafe",
        occurredAt,
      }),
    ).toThrow("does not match the deterministic plan");
  });
});
