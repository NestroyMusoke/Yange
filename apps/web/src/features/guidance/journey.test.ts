import { describe, expect, it } from "vitest";
import { createSeedState } from "@yange/domain";
import { deriveYangeJourney } from "./journey";

const readiness = { atRiskOutfitIds: [] };

describe("deriveYangeJourney", () => {
  it("guides a sample user to add the first missing essential", () => {
    const state = createSeedState();
    const journey = deriveYangeJourney(state, readiness);
    expect(journey.next.view).toBe("studio");
    expect(journey.next.title).toBe("Add a top next");
  });

  it("does not count sample garments as a personal wardrobe", () => {
    const state = createSeedState();
    expect(deriveYangeJourney(state, readiness).milestones[0].complete).toBe(false);
  });

  it("asks for the next precise category as personal pieces arrive", () => {
    const state = createSeedState();
    const top = { ...state.garments["cream-blouse"], id: "mine-top", source: "user-added" as const };
    state.garments[top.id] = top;
    expect(deriveYangeJourney(state, readiness).next.title).toBe("Add a bottom next");
  });

  it("prioritises an outfit risk over a routine outfit review", () => {
    const state = createSeedState();
    const personalEssentials = [
      { ...state.garments["cream-blouse"], id: "mine-top", source: "user-added" as const },
      { ...state.garments["chocolate-trousers"], id: "mine-bottom", source: "user-added" as const },
      { ...state.garments["black-loafers"], id: "mine-shoes", source: "user-added" as const },
    ];
    for (const garment of personalEssentials) state.garments[garment.id] = garment;
    state.wardrobeMode = "personal";
    state.outfits["risk-look"] = {
      ...state.outfits["friday-rooftop"],
      id: "risk-look",
      source: "agent-planned",
      status: "planned",
    };

    const journey = deriveYangeJourney(state, { atRiskOutfitIds: ["risk-look"] });
    expect(journey.next.view).toBe("wearcast");
    expect(journey.next.title).toBe("Protect your upcoming outfit");
  });
});
