import { describe, expect, it } from "vitest";
import { detectedMime, ImagePipelineError, inspectPreparedBlob, scaledDimensions } from "./imagePipeline";

describe("image pipeline compatibility", () => {
  it("recognizes Safari's PNG fallback even when WebP was requested", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const blob = new Blob([pngBytes], { type: "image/webp" });

    await expect(inspectPreparedBlob(blob)).resolves.toEqual({
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("recognizes the three accepted rewritten formats by signature", () => {
    expect(detectedMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(detectedMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectedMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("keeps garment preparation lighter while preserving label detail", () => {
    expect(scaledDimensions(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
    expect(scaledDimensions(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("preserves smaller images and rejects invalid dimensions", () => {
    expect(scaledDimensions(900, 1200)).toEqual({ width: 900, height: 1200 });
    expect(() => scaledDimensions(0, 1200)).toThrow(ImagePipelineError);
  });
});
