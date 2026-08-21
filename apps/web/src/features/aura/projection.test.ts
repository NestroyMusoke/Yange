import { describe, expect, it } from "vitest";
import { advanceProjectedPalette, blendHex, MAX_PALETTE_LEARNING_RATE } from "./projection";

describe("persisted Style Aura projection", () => {
  it("moves each displayed colour by no more than eight percent per new evidence signature", () => {
    const current = ["#000000", "#204060", "#804020", "#FFFFFF"];
    const target = ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#000000"];
    const next = advanceProjectedPalette(current, target);
    expect(next[0]).toBe("#141414");
    expect(next[3]).toBe("#EBEBEB");
    expect(MAX_PALETTE_LEARNING_RATE).toBe(0.08);
  });

  it("keeps invalid legacy values from poisoning the visual target", () => {
    expect(blendHex("invalid", "#123456", 0.08)).toBe("#123456");
  });
});
