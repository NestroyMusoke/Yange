import { describe, expect, it } from "vitest";
import { ImagePipelineError, scaledDimensions } from "./imagePipeline";

describe("image pipeline geometry", () => {
  it("preserves aspect ratio while bounding the longest edge", () => {
    expect(scaledDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledDimensions(900, 1200)).toEqual({ width: 900, height: 1200 });
  });

  it("rejects invalid dimensions", () => {
    expect(() => scaledDimensions(0, 1200)).toThrow(ImagePipelineError);
  });
});
