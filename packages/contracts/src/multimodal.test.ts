import { describe, expect, it } from "vitest";
import {
  ContractValidationError,
  FakeGeminiMultimodalAdapter,
  MULTIMODAL_CONTRACT_VERSION,
  parseMultimodalResponse,
  type MultimodalRequestV1,
} from "./index";

const now = "2026-08-14T12:00:00.000Z";

function request(mode: "garment" | "look-dna", withLabel = false): MultimodalRequestV1 {
  return {
    contractVersion: MULTIMODAL_CONTRACT_VERSION,
    requestId: `${mode}-request`,
    mode,
    images: [
      {
        assetId: "asset-main",
        kind: mode === "garment" ? "garment" : "inspiration",
        fileName: "sample-look.webp",
        mimeType: "image/webp",
        byteLength: 42_000,
        width: 1200,
        height: 1500,
      },
      ...(withLabel
        ? [
            {
              assetId: "asset-label",
              kind: "care-label" as const,
              fileName: "care-label.webp",
              mimeType: "image/webp" as const,
              byteLength: 18_000,
              width: 900,
              height: 700,
            },
          ]
        : []),
    ],
  };
}

describe("multimodal contract", () => {
  it("returns deterministic garment evidence that requires review", async () => {
    const adapter = new FakeGeminiMultimodalAdapter({ now: () => now });
    const first = await adapter.analyze(request("garment", true));
    const second = await adapter.analyze(request("garment", true));

    expect(first).toEqual(second);
    expect(first.mode).toBe("garment");
    if (first.mode === "garment") {
      expect(first.careProfile.wash.provenance).toBe("label-extracted");
      expect(first.careProfile.wash.reviewStatus).toBe("needs-review");
    }
  });

  it("produces a bounded palette for inspiration Look DNA", async () => {
    const adapter = new FakeGeminiMultimodalAdapter({ now: () => now });
    const result = await adapter.analyze(request("look-dna"));

    expect(result.mode).toBe("look-dna");
    if (result.mode === "look-dna") {
      expect(result.look.palette.length).toBeGreaterThan(0);
      expect(result.look.palette.length).toBeLessThanOrEqual(6);
    }
  });

  it("rejects model output that auto-confirms extracted care", () => {
    const unsafe = {
      contractVersion: "1.0",
      requestId: "unsafe",
      adapter: "test",
      generatedAt: now,
      warnings: [],
      mode: "garment",
      facts: {
        name: { value: "Shirt", provenance: "ai-estimated", confidence: 0.9, reviewStatus: "needs-review" },
        category: { value: "top", provenance: "ai-estimated", confidence: 0.9, reviewStatus: "needs-review" },
        colour: { value: "Cream", provenance: "ai-estimated", confidence: 0.9, reviewStatus: "needs-review" },
        material: { value: "Cotton", provenance: "label-extracted", confidence: 0.9, reviewStatus: "needs-review" },
      },
      careProfile: {
        wash: { value: "machine-cold", provenance: "label-extracted", confidence: 0.9, reviewStatus: "confirmed" },
        dry: { value: "line-dry", provenance: "label-extracted", confidence: 0.9, reviewStatus: "needs-review" },
        iron: { value: "low", provenance: "label-extracted", confidence: 0.9, reviewStatus: "needs-review" },
        bleach: { value: "do-not-bleach", provenance: "label-extracted", confidence: 0.9, reviewStatus: "needs-review" },
        notes: { value: [], provenance: "label-extracted", confidence: 0.9, reviewStatus: "needs-review" },
      },
      suggestedWearPolicy: { postWearMode: "wash", maxWearsBeforeWash: 1 },
    };

    expect(() => parseMultimodalResponse(unsafe)).toThrow(ContractValidationError);
  });

  it("supports an observable one-shot failure and clean retry", async () => {
    const adapter = new FakeGeminiMultimodalAdapter({ now: () => now });
    adapter.failNext();

    await expect(adapter.analyze(request("look-dna"))).rejects.toThrow(
      "temporarily unavailable",
    );
    await expect(adapter.analyze(request("look-dna"))).resolves.toMatchObject({
      mode: "look-dna",
    });
  });
});
