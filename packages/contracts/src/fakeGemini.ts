import type {
  BleachMethod,
  DryMethod,
  EvidenceProvenance,
  EvidenceValue,
  GarmentCategory,
  IronMethod,
  WashMethod,
} from "@yange/domain";
import {
  MULTIMODAL_CONTRACT_VERSION,
  parseMultimodalResponse,
  type GarmentAnalysisV1,
  type LookDnaAnalysisV1,
  type MultimodalAnalyzer,
  type MultimodalRequestV1,
  type MultimodalResponseV1,
} from "./multimodal";

export interface FakeGeminiOptions {
  latencyMs?: number;
  now?: () => string;
}

function evidence<T>(
  value: T,
  provenance: EvidenceProvenance,
  confidence: number,
): EvidenceValue<T> {
  return {
    value,
    provenance,
    confidence,
    reviewStatus: provenance === "user-confirmed" ? "confirmed" : "needs-review",
  };
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const garmentFixtures: Array<{
  name: string;
  category: GarmentCategory;
  colour: string;
  material: string;
  wash: WashMethod;
  dry: DryMethod;
  iron: IronMethod;
  bleach: BleachMethod;
  notes: string[];
  policy: GarmentAnalysisV1["suggestedWearPolicy"];
}> = [
  {
    name: "Terracotta linen overshirt",
    category: "outerwear",
    colour: "Burnt terracotta",
    material: "55% linen · 45% cotton",
    wash: "machine-cold",
    dry: "line-dry-shade",
    iron: "low",
    bleach: "do-not-bleach",
    notes: ["Wash with similar colours", "Reshape while damp"],
    policy: { postWearMode: "airing", maxWearsBeforeWash: 4 },
  },
  {
    name: "Indigo column dress",
    category: "top",
    colour: "Deep indigo",
    material: "Viscose blend",
    wash: "hand-wash",
    dry: "line-dry-shade",
    iron: "low",
    bleach: "do-not-bleach",
    notes: ["Colour may transfer when damp"],
    policy: { postWearMode: "wash", maxWearsBeforeWash: 1 },
  },
  {
    name: "Olive utility trousers",
    category: "bottom",
    colour: "Soft olive",
    material: "Cotton twill",
    wash: "machine-cold",
    dry: "line-dry",
    iron: "medium",
    bleach: "non-chlorine-only",
    notes: ["Turn inside out before washing"],
    policy: { postWearMode: "rewearable", maxWearsBeforeWash: 3 },
  },
];

export class FakeGeminiMultimodalAdapter implements MultimodalAnalyzer {
  readonly adapterName = "fake-gemini-local-v1";
  private readonly latencyMs: number;
  private readonly now: () => string;
  private shouldFailNext = false;

  constructor(options: FakeGeminiOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  failNext(): void {
    this.shouldFailNext = true;
  }

  async analyze(request: MultimodalRequestV1): Promise<MultimodalResponseV1> {
    if (request.contractVersion !== MULTIMODAL_CONTRACT_VERSION) {
      throw new Error("The local adapter only supports contract 1.0.");
    }
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error("The multimodal adapter was temporarily unavailable.");
    }
    if (!request.images.length) throw new Error("At least one image is required.");

    const response =
      request.mode === "garment"
        ? this.garmentResponse(request)
        : this.lookResponse(request);
    return parseMultimodalResponse(response);
  }

  private garmentResponse(request: MultimodalRequestV1): GarmentAnalysisV1 {
    const key = request.images.map((image) => image.fileName.toLowerCase()).join("|");
    const fixture = garmentFixtures[stableHash(key) % garmentFixtures.length];
    const hasLabel = request.images.some((image) => image.kind === "care-label");
    const careProvenance: EvidenceProvenance = hasLabel
      ? "label-extracted"
      : "ai-estimated";

    return {
      contractVersion: MULTIMODAL_CONTRACT_VERSION,
      requestId: request.requestId,
      adapter: this.adapterName,
      generatedAt: this.now(),
      mode: "garment",
      warnings: hasLabel
        ? ["Material percentages are legible, but every care fact still needs your review."]
        : ["No care label was supplied. Care guidance is a conservative estimate."],
      facts: {
        name: evidence(fixture.name, "ai-estimated", 0.88),
        category: evidence(fixture.category, "ai-estimated", 0.92),
        colour: evidence(fixture.colour, "ai-estimated", 0.9),
        material: evidence(fixture.material, careProvenance, hasLabel ? 0.87 : 0.54),
      },
      careProfile: {
        wash: evidence(hasLabel ? fixture.wash : "unknown", careProvenance, hasLabel ? 0.91 : 0.3),
        dry: evidence(hasLabel ? fixture.dry : "unknown", careProvenance, hasLabel ? 0.86 : 0.3),
        iron: evidence(hasLabel ? fixture.iron : "unknown", careProvenance, hasLabel ? 0.81 : 0.25),
        bleach: evidence(hasLabel ? fixture.bleach : "unknown", careProvenance, hasLabel ? 0.84 : 0.25),
        notes: evidence(hasLabel ? fixture.notes : [], careProvenance, hasLabel ? 0.78 : 0.2),
      },
      suggestedWearPolicy: fixture.policy,
    };
  }

  private lookResponse(request: MultimodalRequestV1): LookDnaAnalysisV1 {
    const key = request.images.map((image) => image.fileName.toLowerCase()).join("|");
    const variant = stableHash(key) % 3;
    const looks = [
      {
        name: "Quiet utility",
        palette: ["#d8c7a7", "#667052", "#332a25", "#b58b72"],
        silhouette: "Relaxed column with a defined high waist",
        keyPieces: ["soft overshirt", "wide-leg trousers", "grounded loafers"],
        layering: ["open lightweight outer layer", "clean tucked base"],
        stylingCues: ["tonal metals", "one structured accessory"],
        occasionCues: ["creative workday", "casual dinner"],
        confidence: 0.9,
      },
      {
        name: "Soft geometry",
        palette: ["#e5ded0", "#6d526f", "#2d3338", "#9c8c75"],
        silhouette: "Cropped structure over a fluid lower half",
        keyPieces: ["cropped jacket", "fluid midi", "minimal jewellery"],
        layering: ["short-over-long proportion"],
        stylingCues: ["matte textures", "single cool accent"],
        occasionCues: ["gallery visit", "evening gathering"],
        confidence: 0.87,
      },
      {
        name: "Sun-washed tailoring",
        palette: ["#c47a57", "#f0dfbf", "#74664c", "#202120"],
        silhouette: "Easy tailoring with a softly defined waist",
        keyPieces: ["linen blazer", "straight trousers", "slim leather shoe"],
        layering: ["breathable tonal layers"],
        stylingCues: ["warm metal detail", "rolled cuffs"],
        occasionCues: ["warm-weather meeting", "weekend lunch"],
        confidence: 0.89,
      },
    ];

    return {
      contractVersion: MULTIMODAL_CONTRACT_VERSION,
      requestId: request.requestId,
      adapter: this.adapterName,
      generatedAt: this.now(),
      mode: "look-dna",
      warnings: ["Yange analyses outfit structure only, never identity or attractiveness."],
      look: looks[variant],
    };
  }
}
