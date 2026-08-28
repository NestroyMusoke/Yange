import { describe, expect, it } from "vitest";
import {
  cutoutAssetId,
  foregroundRatio,
  isReliableForegroundRatio,
  maskBounds,
  normalizeMask,
  paddedSourceCrop,
} from "./garmentCutoutProtocol";

describe("garment cutout contract", () => {
  it("creates a stable Cloud Storage safe derivative ID", () => {
    const id = cutoutAssetId("asset-123e4567-e89b-12d3-a456-426614174000");
    expect(id).toBe("asset-123e4567-e89b-12d3-a456-426614174000--cutout-u2netp-v1");
    expect(id).toMatch(/^[a-zA-Z0-9_-]{1,160}$/);
  });

  it("normalizes raw saliency while preserving a soft edge", () => {
    const mask = normalizeMask(new Float32Array([-4, -2, 0, 2, 4]));
    expect(mask[0]).toBe(0);
    expect(mask[4]).toBe(255);
    expect(mask[2]).toBeGreaterThan(90);
    expect(mask[2]).toBeLessThan(180);
    expect([...mask]).toEqual([...mask].sort((a, b) => a - b));
  });

  it("measures and bounds the foreground without treating feathered noise as a garment", () => {
    const mask = new Uint8ClampedArray([
      2, 2, 2, 2,
      2, 255, 255, 2,
      2, 255, 255, 2,
      2, 2, 2, 2,
    ]);
    expect(foregroundRatio(mask)).toBe(0.25);
    expect(maskBounds(mask, 4, 4)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it("rejects empty and nearly full-frame masks so the original remains visible", () => {
    expect(isReliableForegroundRatio(0)).toBe(false);
    expect(isReliableForegroundRatio(0.014)).toBe(false);
    expect(isReliableForegroundRatio(0.4)).toBe(true);
    expect(isReliableForegroundRatio(0.986)).toBe(false);
    expect(isReliableForegroundRatio(Number.NaN)).toBe(false);
  });

  it("maps mask bounds back to the source and clamps editorial padding", () => {
    expect(paddedSourceCrop(
      { x: 40, y: 20, width: 240, height: 290 },
      1280,
      960,
      320,
      320,
    )).toEqual({ x: 102, y: 8, width: 1076, height: 952 });
    expect(paddedSourceCrop(
      { x: 0, y: 0, width: 320, height: 320 },
      900,
      1200,
      320,
      320,
    )).toEqual({ x: 0, y: 0, width: 900, height: 1200 });
  });
});
