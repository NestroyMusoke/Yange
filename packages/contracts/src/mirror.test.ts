import { describe, expect, it } from "vitest";
import {
  MIRROR_CONTRACT_VERSION,
  parseCreateMirrorJobRequest,
} from "./mirror";

function request() {
  return {
    contractVersion: MIRROR_CONTRACT_VERSION,
    requestId: "mirror-request-1",
    outfitCandidateId: "candidate-1",
    personImage: {
      assetId: "mirror-person-1",
      mimeType: "image/jpeg",
      byteLength: 420_000,
      width: 960,
      height: 1440,
    },
    garment: {
      garmentId: "garment-1",
      assetId: "asset-1",
      name: "Cream blouse",
      category: "top",
    },
    consent: {
      adultConfirmed: true,
      imageRightsConfirmed: true,
      privateProcessingAccepted: true,
      retention: "delete-person-after-generation",
      acceptedAt: "2026-08-29T10:00:00.000Z",
    },
    requestedAt: "2026-08-29T10:00:00.000Z",
  } as const;
}

describe("Yange Mirror contract", () => {
  it("accepts one adult-consented person and one supported wardrobe garment", () => {
    expect(parseCreateMirrorJobRequest(request())).toEqual(request());
  });

  it("rejects partial consent and unsupported multi-pass garment categories", () => {
    expect(() => parseCreateMirrorJobRequest({
      ...request(),
      consent: { ...request().consent, adultConfirmed: false },
    })).toThrow("consent");
    expect(() => parseCreateMirrorJobRequest({
      ...request(),
      garment: { ...request().garment, category: "bottom" },
    })).toThrow("not supported");
  });
});
