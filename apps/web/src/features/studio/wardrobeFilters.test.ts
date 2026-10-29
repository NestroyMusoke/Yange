import { describe, expect, it } from "vitest";
import { createSeedState, type Garment } from "@yange/domain";
import { filterGarments } from "./wardrobeFilters";

const base = Object.values(createSeedState().garments)[0];
const garments: Garment[] = [
  { ...base, id: "top", name: "Everyday shirt", colour: "Black", material: "Cotton", category: "top", state: "available" },
  { ...base, id: "bottom", name: "Work trousers", colour: "Black", material: "Linen", category: "bottom", state: "laundry" },
  { ...base, id: "rewear", name: "Weekend shirt", colour: "White", material: "Cotton", category: "top", state: "rewearable" },
];
const defaults = { query: "", category: "all", availability: "all" } as const;

describe("wardrobe filtering", () => {
  it("preserves all pieces and their order with blank search", () => {
    expect(filterGarments(garments, { ...defaults, query: "  " })).toEqual(garments);
  });
  it("matches words across fields regardless of case, order or extra spaces", () => {
    expect(filterGarments(garments, { ...defaults, query: "  COTTON   black " }).map((item) => item.id)).toEqual(["top"]);
    expect(filterGarments(garments, { ...defaults, query: "work" }).map((item) => item.id)).toEqual(["bottom"]);
  });
  it("combines search, category and availability", () => {
    expect(filterGarments(garments, { query: "cotton", category: "top", availability: "rewearable" }).map((item) => item.id)).toEqual(["rewear"]);
    expect(filterGarments(garments, { ...defaults, category: "bottom" }).map((item) => item.id)).toEqual(["bottom"]);
    expect(filterGarments(garments, { ...defaults, availability: "available" }).map((item) => item.id)).toEqual(["top"]);
  });
  it("returns no matches for conflicting filters or an empty wardrobe", () => {
    expect(filterGarments(garments, { ...defaults, category: "top", availability: "laundry" })).toEqual([]);
    expect(filterGarments(garments, { ...defaults, query: "silk" })).toEqual([]);
    expect(filterGarments([], defaults)).toEqual([]);
  });
});
