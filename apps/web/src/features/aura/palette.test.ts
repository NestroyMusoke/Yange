import { describe, expect, it } from "vitest";
import { createSeedState } from "@yange/domain";
import {
  deriveStyleAuraProfile,
  hexToAuraRgb,
  resolveColour,
} from "./palette";

describe("Style Aura palette evidence", () => {
  it("resolves both hexadecimal and human wardrobe colour names", () => {
    expect(resolveColour("#2a9d8f")).toBe("#2A9D8F");
    expect(resolveColour("Warm cream")).toBe("#D8C7A7");
    expect(resolveColour("Deep olive")).toBe("#66744D");
    expect(resolveColour("not a colour")).toBeNull();
  });

  it("builds four evidence-ranked colourways from the seeded twin", () => {
    const profile = deriveStyleAuraProfile(createSeedState());

    expect(profile.colours).toHaveLength(4);
    expect(new Set(profile.labels.slice(0, 3))).toEqual(new Set(["cream", "olive", "chocolate"]));
    expect(profile.sources.explicitPreferences).toBe(3);
    expect(profile.sources.confirmedGarments).toBe(8);
    expect(profile.stage).toBe("learning");
  });

  it("lets new inspiration evidence reshape the visible palette", () => {
    const state = createSeedState();
    state.inspirationLooks.rose = {
      id: "rose",
      sourceAssetId: "asset-rose",
      contractVersion: "1.0",
      name: "Rose tailoring",
      palette: ["#C04F78", "#394C88", "#2A8A82", "#D2A04B"],
      silhouette: "defined waist",
      keyPieces: ["jacket"],
      layering: [],
      stylingCues: [],
      occasionCues: ["dinner"],
      confidence: 0.94,
      provenance: "ai-estimated",
      createdAt: "2026-08-14T08:00:00.000Z",
    };

    const profile = deriveStyleAuraProfile(state);
    expect(profile.sources.inspirationPalettes).toBe(4);
    expect(profile.evidenceCount).toBe(15);
    expect(profile.colours.some((colour) => colour === "#C04F78")).toBe(true);
    expect(profile.stage).toBe("learning");
  });

  it("returns normalised RGB values for shader uniforms", () => {
    expect(hexToAuraRgb("#FF8040")).toEqual([1, 128 / 255, 64 / 255]);
    expect(hexToAuraRgb("bad-value")).toBeNull();
  });
});
