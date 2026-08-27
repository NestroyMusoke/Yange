import { describe, expect, it } from "vitest";
import {
  MULTIMODAL_CONTRACT_VERSION,
  OUTFIT_EXPLANATION_CONTRACT_VERSION,
} from "@yange/contracts";
import { generateOutfitCandidates, createSeedState } from "@yange/domain";
import type { PrivateMediaStore } from "./media";
import {
  VertexMultimodalAdapter,
  VertexOutfitExplanationAdapter,
  parseStructuredJson,
  type StructuredGenerationClient,
} from "./vertex";

const mediaStore: PrivateMediaStore = {
  async createUploadIntent() { throw new Error("Unused in test."); },
  async createReadUrl() { throw new Error("Unused in test."); },
  async readBytes() { return Buffer.from("rewritten-image"); },
  async delete() {},
};

describe("Vertex supervised adapters", () => {
  it("repairs harmless model JSON fences and trailing commas without changing string content", () => {
    expect(parseStructuredJson(`\`\`\`json
      {
        "note": "Keep the literal sequence ,} inside this string",
        "warnings": ["One", "Two",],
      }
    \`\`\``)).toEqual({
      note: "Keep the literal sequence ,} inside this string",
      warnings: ["One", "Two"],
    });
  });

  it("rejects model text that cannot be safely repaired", () => {
    expect(() => parseStructuredJson('{"name": definitely-not-json}'))
      .toThrow("Vertex AI returned invalid structured JSON");
  });

  it("wraps model content in trusted envelope fields and validates evidence", async () => {
    const client: StructuredGenerationClient = {
      async generate() {
        const evidence = <T>(value: T, provenance: "label-extracted" | "ai-estimated" = "ai-estimated") => ({
          value,
          provenance,
          confidence: 0.82,
          reviewStatus: "needs-review",
        });
        return {
          requestId: "model-spoofed-request",
          adapter: "model-spoofed-adapter",
          mode: "look",
          contractVersion: "999",
          facts: {
            name: evidence("Ivory blouse"),
            category: evidence("top"),
            colour: evidence("Warm ivory"),
            material: evidence("Cotton blend"),
          },
          careProfile: {
            wash: evidence("machine-cold", "label-extracted"),
            dry: evidence("line-dry-shade", "label-extracted"),
            iron: evidence("low", "label-extracted"),
            bleach: evidence("do-not-bleach", "label-extracted"),
            notes: evidence(["Wash with similar colours"], "label-extracted"),
          },
          suggestedWearPolicy: { postWearMode: "wash", maxWearsBeforeWash: 1 },
          warnings: [],
        };
      },
    };
    const adapter = new VertexMultimodalAdapter({
      client,
      mediaStore,
      userId: "user-a",
      model: "gemini-3.5-flash",
      now: () => "2026-08-14T08:00:00.000Z",
    });
    const response = await adapter.analyze({
      contractVersion: MULTIMODAL_CONTRACT_VERSION,
      requestId: "request-a",
      mode: "garment",
      images: [{
        assetId: "asset-a",
        kind: "garment",
        fileName: "garment.webp",
        mimeType: "image/webp",
        byteLength: 100,
        width: 1200,
        height: 1600,
      }],
    });
    expect(response.adapter).toBe("vertex-gemini-multimodal-v1");
    expect(response.requestId).toBe("request-a");
    expect(response.mode).toBe("garment");
    expect(response.contractVersion).toBe(MULTIMODAL_CONTRACT_VERSION);
  });

  it("rejects a model attempt to auto-confirm sensitive care evidence", async () => {
    const client: StructuredGenerationClient = {
      async generate() {
        const evidence = (value: unknown) => ({
          value,
          provenance: "ai-estimated",
          confidence: 1,
          reviewStatus: "confirmed",
        });
        return {
          facts: { name: evidence("Top"), category: evidence("top"), colour: evidence("Blue"), material: evidence("Cotton") },
          careProfile: { wash: evidence("machine-cold"), dry: evidence("line-dry"), iron: evidence("low"), bleach: evidence("allowed"), notes: evidence([]) },
          suggestedWearPolicy: { postWearMode: "wash", maxWearsBeforeWash: 1 },
          warnings: [],
        };
      },
    };
    const adapter = new VertexMultimodalAdapter({ client, mediaStore, userId: "user-a", model: "gemini-3.5-flash" });
    await expect(adapter.analyze({
      contractVersion: MULTIMODAL_CONTRACT_VERSION,
      requestId: "unsafe",
      mode: "garment",
      images: [{ assetId: "asset-a", kind: "garment", fileName: "a.webp", mimeType: "image/webp", byteLength: 1, width: 1, height: 1 }],
    })).rejects.toThrow("cannot be auto-confirmed");
  });

  it("prevents the explanation model from replacing deterministic decisions", async () => {
    const state = createSeedState();
    const candidate = generateOutfitCandidates(state, {
      version: 1,
      weather: { source: "test", location: "Kampala", observedAt: "2026-08-14T07:00:00.000Z", temperatureC: 24, precipitationProbability: 20, condition: "clear" },
      calendar: { source: "test", eventId: "event", title: "Dinner", startsAt: "2026-08-14T16:00:00.000Z", occasion: "dinner", dressCode: "polished", notes: "" },
      inspirationLookId: null,
    })[0];
    if (!candidate) throw new Error("Expected a candidate fixture.");
    const client: StructuredGenerationClient = {
      async generate() {
        return {
          headline: "Model tried too much",
          rationale: "Explanation only.",
          tradeoffs: [],
          citedFactorKeys: [candidate.scoreBreakdown[0]?.key],
          personalMatch: 100,
        };
      },
    };
    const adapter = new VertexOutfitExplanationAdapter({ client, model: "gemini-3.5-flash" });
    await expect(adapter.explain({
      contractVersion: OUTFIT_EXPLANATION_CONTRACT_VERSION,
      requestId: "explain-a",
      candidate,
    })).rejects.toThrow("cannot contain decisions or state changes");
  });
});
