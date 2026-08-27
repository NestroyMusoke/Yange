import { GoogleGenAI, MediaResolution, ThinkingLevel } from "@google/genai";
import {
  MULTIMODAL_CONTRACT_VERSION,
  OUTFIT_EXPLANATION_CONTRACT_VERSION,
  parseMultimodalResponse,
  parseOutfitExplanation,
  type MultimodalAnalyzer,
  type MultimodalRequestV1,
  type MultimodalResponseV1,
  type OutfitExplanationPort,
  type OutfitExplanationRequestV1,
  type OutfitExplanationV1,
} from "@yange/contracts";
import type { MatchFactorKey } from "@yange/domain";
import type { PrivateMediaStore } from "./media";

export interface StructuredGenerationRequest {
  model: string;
  systemInstruction: string;
  prompt: string;
  images?: { mimeType: string; data: string }[];
  responseJsonSchema: unknown;
}

export interface StructuredGenerationClient {
  generate(request: StructuredGenerationRequest): Promise<unknown>;
}

function removeTrailingJsonCommas(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let lookahead = index + 1;
      while (/\s/.test(value[lookahead] ?? "")) lookahead += 1;
      if (value[lookahead] === "}" || value[lookahead] === "]") continue;
    }
    result += character;
  }
  return result;
}

export function parseStructuredJson(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  try {
    return JSON.parse(withoutFence) as unknown;
  } catch (firstError) {
    try {
      return JSON.parse(removeTrailingJsonCommas(withoutFence)) as unknown;
    } catch {
      const reason = firstError instanceof Error ? firstError.message : "Invalid JSON.";
      throw new Error(`Vertex AI returned invalid structured JSON: ${reason}`);
    }
  }
}

export class GoogleVertexStructuredGenerationClient implements StructuredGenerationClient {
  private readonly client: GoogleGenAI;

  constructor(projectId: string, location: string) {
    this.client = new GoogleGenAI({ vertexai: true, project: projectId, location });
  }

  async generate(request: StructuredGenerationRequest): Promise<unknown> {
    const response = await this.client.models.generateContent({
      model: request.model,
      contents: [{
        role: "user",
        parts: [
          { text: request.prompt },
          ...(request.images ?? []).map((image) => ({
            inlineData: { mimeType: image.mimeType, data: image.data },
          })),
        ],
      }],
      config: {
        systemInstruction: request.systemInstruction,
        maxOutputTokens: 2_048,
        // Garment extraction is a bounded visual classification task. Minimal
        // thinking removes avoidable latency while the schema keeps it safe.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        responseMimeType: "application/json",
        responseJsonSchema: request.responseJsonSchema,
      },
    });
    if (!response.text) throw new Error("Vertex AI returned no structured text response.");
    return parseStructuredJson(response.text);
  }
}

const evidenceSchema = (value: unknown) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    value,
    provenance: { type: "string", enum: ["label-extracted", "ai-estimated"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reviewStatus: { type: "string", enum: ["needs-review"] },
  },
  required: ["value", "provenance", "confidence", "reviewStatus"],
});

const garmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    facts: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: evidenceSchema({ type: "string", maxLength: 80 }),
        category: evidenceSchema({ type: "string", enum: ["top", "bottom", "outerwear", "shoes", "accessory"] }),
        colour: evidenceSchema({ type: "string", maxLength: 80 }),
        material: evidenceSchema({ type: "string", maxLength: 120 }),
      },
      required: ["name", "category", "colour", "material"],
    },
    careProfile: {
      type: "object",
      additionalProperties: false,
      properties: {
        wash: evidenceSchema({ type: "string", enum: ["machine-cold", "machine-warm", "hand-wash", "dry-clean", "unknown"] }),
        dry: evidenceSchema({ type: "string", enum: ["line-dry", "line-dry-shade", "flat-dry", "tumble-low", "unknown"] }),
        iron: evidenceSchema({ type: "string", enum: ["low", "medium", "high", "do-not-iron", "unknown"] }),
        bleach: evidenceSchema({ type: "string", enum: ["allowed", "non-chlorine-only", "do-not-bleach", "unknown"] }),
        notes: evidenceSchema({ type: "array", items: { type: "string", maxLength: 160 }, maxItems: 12 }),
      },
      required: ["wash", "dry", "iron", "bleach", "notes"],
    },
    suggestedWearPolicy: {
      type: "object",
      additionalProperties: false,
      properties: {
        postWearMode: { type: "string", enum: ["wash", "rewearable", "airing", "available"] },
        maxWearsBeforeWash: { type: "integer", minimum: 1, maximum: 30 },
      },
      required: ["postWearMode", "maxWearsBeforeWash"],
    },
    warnings: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 10 },
  },
  required: ["facts", "careProfile", "suggestedWearPolicy", "warnings"],
};

const lookSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    look: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", maxLength: 80 },
        palette: { type: "array", items: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, minItems: 1, maxItems: 6 },
        silhouette: { type: "string", maxLength: 160 },
        keyPieces: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 12 },
        layering: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 12 },
        stylingCues: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 12 },
        occasionCues: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 12 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["name", "palette", "silhouette", "keyPieces", "layering", "stylingCues", "occasionCues", "confidence"],
    },
    warnings: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 10 },
  },
  required: ["look", "warnings"],
};

export class VertexMultimodalAdapter implements MultimodalAnalyzer {
  readonly adapterName = "vertex-gemini-multimodal-v1";

  constructor(
    private readonly options: {
      client: StructuredGenerationClient;
      mediaStore: PrivateMediaStore;
      userId: string;
      model: string;
      now?: () => string;
    },
  ) {}

  async analyze(request: MultimodalRequestV1): Promise<MultimodalResponseV1> {
    if (request.contractVersion !== MULTIMODAL_CONTRACT_VERSION) {
      throw new Error("Vertex multimodal adapter only supports contract 1.0.");
    }
    const images = await Promise.all(request.images.map(async (image) => ({
      mimeType: image.mimeType,
      data: (await this.options.mediaStore.readBytes(this.options.userId, image.assetId)).toString("base64"),
    })));
    const raw = await this.options.client.generate({
      model: this.options.model,
      systemInstruction: request.mode === "garment"
        ? "Extract observable garment and care-label evidence. Never invent certainty, never mark a field confirmed, and use unknown when a care symbol is unreadable. Do not judge bodies, skin tone, attractiveness, or personal worth."
        : "Describe transferable styling cues from the inspiration image. Do not identify the person or judge their body, skin, or attractiveness. Return options as visual evidence, not rules.",
      prompt: `Yange multimodal contract ${request.contractVersion}. Analyze ${request.images.length} image(s) in ${request.mode} mode. Image order and roles: ${request.images.map((image) => image.kind).join(", ")}.`,
      images,
      responseJsonSchema: request.mode === "garment" ? garmentSchema : lookSchema,
    });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Vertex multimodal response was not an object.");
    }
    const body = raw as Record<string, unknown>;
    return parseMultimodalResponse({
      ...body,
      contractVersion: MULTIMODAL_CONTRACT_VERSION,
      requestId: request.requestId,
      adapter: this.adapterName,
      generatedAt: (this.options.now ?? (() => new Date().toISOString()))(),
      mode: request.mode,
      warnings: Array.isArray(body.warnings) ? body.warnings : [],
    });
  }
}

const explanationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string", maxLength: 90 },
    rationale: { type: "string", maxLength: 500 },
    tradeoffs: { type: "array", items: { type: "string", maxLength: 180 }, maxItems: 4 },
    citedFactorKeys: {
      type: "array",
      items: { type: "string", enum: ["availability", "colour", "style-memory", "context", "care-practicality"] },
      minItems: 1,
      maxItems: 5,
    },
  },
  required: ["headline", "rationale", "tradeoffs", "citedFactorKeys"],
};

export class VertexOutfitExplanationAdapter implements OutfitExplanationPort {
  readonly adapterName = "vertex-gemini-explainer-v1";

  constructor(
    private readonly options: {
      client: StructuredGenerationClient;
      model: string;
      now?: () => string;
    },
  ) {}

  async explain(request: OutfitExplanationRequestV1): Promise<OutfitExplanationV1> {
    if (request.contractVersion !== OUTFIT_EXPLANATION_CONTRACT_VERSION) {
      throw new Error("Vertex explanation adapter only supports contract 1.0.");
    }
    const allowedFactorKeys = request.candidate.scoreBreakdown.map((factor) => factor.key);
    const raw = await this.options.client.generate({
      model: this.options.model,
      systemInstruction: "Explain a completed deterministic outfit score in warm, concise language. You cannot select garments, replace the score, emit actions, or claim objective attractiveness. Cite only supplied factor keys.",
      prompt: JSON.stringify({
        name: request.candidate.name,
        personalMatch: request.candidate.personalMatch,
        factors: request.candidate.scoreBreakdown,
        allowedFactorKeys,
      }),
      responseJsonSchema: explanationSchema,
    });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Vertex explanation response was not an object.");
    }
    const candidate = raw as Record<string, unknown>;
    if (Array.isArray(candidate.citedFactorKeys)) {
      candidate.citedFactorKeys = candidate.citedFactorKeys.filter(
        (key): key is MatchFactorKey => typeof key === "string" && allowedFactorKeys.includes(key as MatchFactorKey),
      );
    }
    return parseOutfitExplanation({
      ...candidate,
      contractVersion: OUTFIT_EXPLANATION_CONTRACT_VERSION,
      requestId: request.requestId,
      adapter: this.adapterName,
      generatedAt: (this.options.now ?? (() => new Date().toISOString()))(),
    }, allowedFactorKeys);
  }
}
