import { describe, expect, it } from "vitest";
import { createSeedState } from "@yange/domain";
import {
  AURORA_SPECTRUM,
  composeAuraSpectrum,
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

  it("keeps the four aurora anchor dyes visible while learning wardrobe colours", () => {
    const composed = composeAuraSpectrum(["#D8C7A7", "#66744D", "#6E4937", "#B9637C"], 0.28);

    expect(composed).toHaveLength(4);
    composed.forEach((colour, index) => {
      const visible = hexToAuraRgb(colour)!;
      const anchor = hexToAuraRgb(AURORA_SPECTRUM[index])!;
      expect(Math.hypot(
        visible[0] - anchor[0],
        visible[1] - anchor[1],
        visible[2] - anchor[2],
      )).toBeLessThan(0.3);
    });
  });

  it("promotes repeated exact-colour confidence and suppresses explicit negative preference", () => {
    const state = createSeedState();
    state.styleProfile.preferredColours = [];
    state.styleProfile.avoidedColours = ["rose"];
    state.styleMemory.colourPreferences.emerald = {
      colourFamily: "emerald",
      representativeHex: "#2D9B72",
      label: "emerald",
      positiveEvidence: 1.7,
      negativeEvidence: 0,
      observations: 3,
      score: 0.73,
      certainty: 0.71,
      lastObservedAt: "2026-08-14T09:00:00.000Z",
      userAttributedObservations: 2,
    };
    state.inspirationLooks.rose = {
      id: "rose",
      sourceAssetId: "rose-asset",
      contractVersion: "1.0",
      name: "Rose look",
      palette: ["#B9637C"],
      silhouette: "column",
      keyPieces: [], layering: [], stylingCues: [], occasionCues: [],
      confidence: 0.95,
      provenance: "ai-estimated",
      createdAt: "2026-08-14T08:00:00.000Z",
    };

    const profile = deriveStyleAuraProfile(state);
    expect(profile.labels).toContain("emerald");
    expect(profile.labels).not.toContain("Rose look palette");
    expect(profile.sources.negativeSignals).toBeGreaterThan(0);
    expect(profile.insights[profile.labels.indexOf("emerald")]).toContain("3 confidence");
  });

  it("softens stale colour evidence when newer lived evidence arrives", () => {
    const state = createSeedState();
    state.styleProfile.preferredColours = [];
    state.styleMemory.colourPreferences = {
      emerald: {
        colourFamily: "emerald", representativeHex: "#2D9B72", label: "emerald",
        positiveEvidence: 2.2, negativeEvidence: 0, observations: 3, score: 0.76,
        certainty: 0.9, lastObservedAt: "2025-01-01T00:00:00.000Z", userAttributedObservations: 3,
      },
      cyan: {
        colourFamily: "cyan", representativeHex: "#2C9FBB", label: "cyan",
        positiveEvidence: 1.8, negativeEvidence: 0, observations: 3, score: 0.74,
        certainty: 0.75, lastObservedAt: "2026-08-14T00:00:00.000Z", userAttributedObservations: 2,
      },
    };

    const profile = deriveStyleAuraProfile(state);
    expect(profile.labels).toContain("cyan");
    expect(profile.labels).not.toContain("emerald");
  });
});
