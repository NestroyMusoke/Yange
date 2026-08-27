import { describe, expect, it } from "vitest";
import {
  addGarment,
  activatePersonalWardrobe,
  archiveGarment,
  calculateReadiness,
  captureLookDna,
  createSeedState,
  markOutfitWorn,
  recordConfidence,
  replayEvents,
  updateStyleProfile,
  updateGarment,
  updateUserProfile,
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
    expect(confidenceEvents.filter((event) => event.type === "ColourEvidenceRecorded")).toHaveLength(5);
    expect(learned.styleMemory.colourPreferences.cream.positiveEvidence).toBeGreaterThan(0);
    expect(learned.styleMemory.colourPreferences.cream.userAttributedObservations).toBe(1);
  });

  it("records explicit negative evidence for the exact colours in a low-confidence outfit", () => {
    const seed = createSeedState();
    const wearEvents = markOutfitWorn(seed, [], {
      outfitId: "today-city-calm",
      wearContext: "normal",
      operationId: "wear-negative",
      occurredAt: now,
    });
    const worn = replayEvents(seed, wearEvents);
    const feedback = recordConfidence(worn, wearEvents, {
      outfitId: "today-city-calm",
      value: 1,
      tags: ["colour-missed"],
      operationId: "confidence-negative",
      occurredAt: now,
    });
    const learned = replayEvents(worn, feedback);

    expect(learned.styleMemory.colourPreferences.cream.negativeEvidence).toBeGreaterThan(0);
    expect(learned.styleMemory.colourPreferences.cream.score).toBeLessThan(0.5);
    expect(learned.styleMemory.colourEvidence.every((entry) => entry.direction === "negative")).toBe(true);
  });

  it("decays older colour evidence when a newer observation arrives", () => {
    const seed = createSeedState();
    const first = {
      id: "colour-old",
      operationId: "colour-old",
      occurredAt: "2026-01-01T00:00:00.000Z",
      type: "ColourEvidenceRecorded" as const,
      payload: { evidence: {
        id: "colour-old",
        colourFamily: "emerald",
        exactHex: "#2D9B72",
        label: "emerald",
        source: "confidence-check-in" as const,
        direction: "positive" as const,
        strength: 1,
        attribution: "user-attributed" as const,
        garmentId: "emerald-top",
        outfitId: "look-old",
        occurredAt: "2026-01-01T00:00:00.000Z",
      } },
    };
    const second = structuredClone(first);
    second.id = "colour-new";
    second.operationId = "colour-new";
    second.occurredAt = "2026-04-01T00:00:00.000Z";
    second.payload.evidence.id = "colour-new";
    second.payload.evidence.occurredAt = second.occurredAt;
    const learned = replayEvents(seed, [first, second]);

    expect(learned.styleMemory.colourPreferences.emerald.positiveEvidence).toBeGreaterThan(1);
    expect(learned.styleMemory.colourPreferences.emerald.positiveEvidence).toBeLessThan(2);
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

  it("adds a provenance-aware garment through an idempotent event", () => {
    const seed = createSeedState();
    const garment = structuredClone(seed.garments["cream-blouse"]);
    garment.id = "user-linen-shirt";
    garment.name = "Terracotta linen shirt";
    garment.source = "user-added";
    garment.provenance.colour = {
      provenance: "ai-estimated",
      confidence: 0.82,
      reviewStatus: "needs-review",
    };

    const events = addGarment(seed, [], {
      garment,
      operationId: "garment-1",
      occurredAt: now,
    });
    const projected = replayEvents(seed, events);

    expect(projected.garments[garment.id].name).toBe(garment.name);
    expect(projected.garments[garment.id].provenance.colour.reviewStatus).toBe(
      "needs-review",
    );
    expect(
      addGarment(projected, events, {
        garment,
        operationId: "garment-1",
        occurredAt: now,
      }),
    ).toEqual([]);
  });

  it("switches from sample data to a real personal wardrobe without losing captured pieces", () => {
    const seed = createSeedState();
    const garment = structuredClone(seed.garments["cream-blouse"]);
    garment.id = "my-shirt";
    garment.name = "My shirt";
    garment.source = "user-added";
    const added = addGarment(seed, [], { garment, operationId: "add-real", occurredAt: now });
    const withCapture = replayEvents(seed, added);
    const activated = activatePersonalWardrobe(withCapture, added, { operationId: "personal", occurredAt: now });
    const personal = replayEvents(withCapture, activated);

    expect(personal.wardrobeMode).toBe("personal");
    expect(Object.keys(personal.garments)).toEqual(["my-shirt"]);
    expect(personal.outfits).toEqual({});
  });

  it("edits and archives user garments as replayable events", () => {
    const seed = createSeedState();
    const garment = structuredClone(seed.garments["cream-blouse"]);
    garment.id = "my-top";
    garment.source = "user-added";
    const added = addGarment(seed, [], { garment, operationId: "add", occurredAt: now });
    const withGarment = replayEvents(seed, added);
    const changed = { ...withGarment.garments[garment.id], colour: "Emerald" };
    const updated = updateGarment(withGarment, added, { garment: changed, operationId: "edit", occurredAt: now });
    const afterEdit = replayEvents(withGarment, updated);
    const archived = archiveGarment(afterEdit, [...added, ...updated], { garmentId: garment.id, operationId: "archive", occurredAt: now });
    const afterArchive = replayEvents(afterEdit, archived);

    expect(afterEdit.garments[garment.id].colour).toBe("Emerald");
    expect(afterArchive.garments[garment.id].archived).toBe(true);
    expect(calculateReadiness(afterArchive).totalGarments).toBe(calculateReadiness(seed).totalGarments);
  });

  it("persists the owner and location used by live context", () => {
    const seed = createSeedState();
    const profile = { ...seed.userProfile, displayName: "Nestroy", locationLabel: "Entebbe", latitude: 0.0512, longitude: 32.4637, onboardingCompletedAt: now };
    const events = updateUserProfile([], { profile, operationId: "owner", occurredAt: now });
    expect(replayEvents(seed, events).userProfile).toEqual(profile);
  });

  it("rejects extracted care data disguised as user-confirmed", () => {
    const seed = createSeedState();
    const garment = structuredClone(seed.garments["cream-blouse"]);
    garment.id = "unsafe-care-item";
    garment.source = "user-added";
    garment.careProfile.wash = {
      value: "machine-cold",
      provenance: "label-extracted",
      confidence: 0.96,
      reviewStatus: "confirmed",
    };

    expect(() =>
      addGarment(seed, [], {
        garment,
        operationId: "garment-unsafe",
        occurredAt: now,
      }),
    ).toThrow("cannot be confirmed without user review");
  });

  it("persists user-controlled Style DNA through replay", () => {
    const seed = createSeedState();
    const profile = {
      ...seed.styleProfile,
      heightCm: 174,
      preferredColours: ["plum", "cream"],
      fitPreferences: ["relaxed" as const],
      updatedAt: now,
    };
    const events = updateStyleProfile([], {
      profile,
      operationId: "profile-1",
      occurredAt: now,
    });

    expect(replayEvents(seed, events).styleProfile).toEqual(profile);
  });

  it("stores versioned inspiration Look DNA", () => {
    const seed = createSeedState();
    const look = {
      id: "look-1",
      sourceAssetId: "asset-1",
      contractVersion: "1.0" as const,
      name: "Soft utility",
      palette: ["#e6d8ba", "#5e6948"],
      silhouette: "relaxed column",
      keyPieces: ["overshirt", "wide-leg trousers"],
      layering: ["light outer layer"],
      stylingCues: ["tonal accessories"],
      occasionCues: ["creative workday"],
      confidence: 0.88,
      provenance: "ai-estimated" as const,
      createdAt: now,
    };
    const events = captureLookDna(seed, [], {
      look,
      operationId: "look-1",
      occurredAt: now,
    });

    expect(replayEvents(seed, events).inspirationLooks[look.id]).toEqual(look);
  });
});
