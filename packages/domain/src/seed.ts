import type { TwinState } from "./types";

export function createSeedState(): TwinState {
  return {
    garments: {
      "cream-blouse": {
        id: "cream-blouse",
        name: "Cream cotton blouse",
        category: "top",
        colour: "Warm cream",
        material: "82% cotton · 18% modal",
        state: "available",
        wearsSinceWash: 0,
        wearPolicy: {
          postWearMode: "wash",
          maxWearsBeforeWash: 1,
          source: "user-confirmed",
        },
      },
      "chocolate-trousers": {
        id: "chocolate-trousers",
        name: "Chocolate wide-leg trousers",
        category: "bottom",
        colour: "Chocolate",
        material: "Cotton-viscose blend",
        state: "available",
        wearsSinceWash: 0,
        wearPolicy: {
          postWearMode: "rewearable",
          maxWearsBeforeWash: 3,
          source: "care-profile",
        },
      },
      "olive-jacket": {
        id: "olive-jacket",
        name: "Olive cropped jacket",
        category: "outerwear",
        colour: "Deep olive",
        material: "Linen-cotton blend",
        state: "available",
        wearsSinceWash: 1,
        wearPolicy: {
          postWearMode: "airing",
          maxWearsBeforeWash: 5,
          source: "care-profile",
        },
      },
      "gold-earrings": {
        id: "gold-earrings",
        name: "Sculpted gold earrings",
        category: "accessory",
        colour: "Gold",
        material: "Gold-plated steel",
        state: "available",
        wearsSinceWash: 0,
        wearPolicy: {
          postWearMode: "available",
          maxWearsBeforeWash: 20,
          source: "user-confirmed",
        },
      },
      "black-loafers": {
        id: "black-loafers",
        name: "Black leather loafers",
        category: "shoes",
        colour: "Black",
        material: "Leather upper",
        state: "available",
        wearsSinceWash: 2,
        wearPolicy: {
          postWearMode: "available",
          maxWearsBeforeWash: 20,
          source: "user-confirmed",
        },
      },
      "ivory-knit": {
        id: "ivory-knit",
        name: "Ivory ribbed knit",
        category: "top",
        colour: "Ivory",
        material: "Viscose-nylon blend",
        state: "available",
        wearsSinceWash: 0,
        wearPolicy: {
          postWearMode: "wash",
          maxWearsBeforeWash: 1,
          source: "care-profile",
        },
      },
    },
    outfits: {
      "today-city-calm": {
        id: "today-city-calm",
        name: "City Calm",
        occasion: "Creative workday",
        scheduledFor: "Today",
        garmentIds: [
          "cream-blouse",
          "chocolate-trousers",
          "olive-jacket",
          "gold-earrings",
          "black-loafers",
        ],
        status: "planned",
        personalMatch: 88,
        styleSignals: ["warm-neutral", "structured", "high-waist"],
      },
      "friday-rooftop": {
        id: "friday-rooftop",
        name: "Friday Rooftop",
        occasion: "Dinner in Kampala",
        scheduledFor: "Friday · 7:00 PM",
        garmentIds: [
          "cream-blouse",
          "chocolate-trousers",
          "gold-earrings",
          "black-loafers",
        ],
        status: "planned",
        personalMatch: 91,
        styleSignals: ["warm-neutral", "elegant", "high-waist"],
      },
    },
    feedback: [],
    styleMemory: {
      feedbackCount: 0,
      averageConfidence: null,
      signals: {},
    },
  };
}

