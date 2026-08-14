import type { MatchFactorKey, OutfitCandidate } from "@yange/domain";
import { ContractValidationError } from "./multimodal";

export const OUTFIT_EXPLANATION_CONTRACT_VERSION = "1.0" as const;

export interface OutfitExplanationRequestV1 {
  contractVersion: typeof OUTFIT_EXPLANATION_CONTRACT_VERSION;
  requestId: string;
  candidate: OutfitCandidate;
}

export interface OutfitExplanationV1 {
  contractVersion: typeof OUTFIT_EXPLANATION_CONTRACT_VERSION;
  requestId: string;
  adapter: string;
  generatedAt: string;
  headline: string;
  rationale: string;
  tradeoffs: string[];
  citedFactorKeys: MatchFactorKey[];
}

export interface OutfitExplanationPort {
  explain(request: OutfitExplanationRequestV1): Promise<OutfitExplanationV1>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOutfitExplanation(
  value: unknown,
  allowedFactorKeys: MatchFactorKey[],
): OutfitExplanationV1 {
  if (!isRecord(value)) throw new ContractValidationError("Explanation must be an object.");
  const forbidden = ["garmentIds", "personalMatch", "events", "actions", "stateChanges"];
  if (forbidden.some((key) => key in value)) {
    throw new ContractValidationError("Explanation output cannot contain decisions or state changes.");
  }
  const allowed = new Set([
    "contractVersion",
    "requestId",
    "adapter",
    "generatedAt",
    "headline",
    "rationale",
    "tradeoffs",
    "citedFactorKeys",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ContractValidationError("Explanation output contains an unrecognized field.");
  }
  if (
    value.contractVersion !== OUTFIT_EXPLANATION_CONTRACT_VERSION ||
    typeof value.requestId !== "string" ||
    !value.requestId ||
    typeof value.adapter !== "string" ||
    !value.adapter ||
    typeof value.generatedAt !== "string" ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    typeof value.headline !== "string" ||
    !value.headline ||
    value.headline.length > 90 ||
    typeof value.rationale !== "string" ||
    !value.rationale ||
    value.rationale.length > 500 ||
    !Array.isArray(value.tradeoffs) ||
    value.tradeoffs.length > 4 ||
    !value.tradeoffs.every((entry) => typeof entry === "string" && entry.length <= 180) ||
    !Array.isArray(value.citedFactorKeys) ||
    !value.citedFactorKeys.length ||
    !value.citedFactorKeys.every(
      (entry) => typeof entry === "string" && allowedFactorKeys.includes(entry as MatchFactorKey),
    )
  ) {
    throw new ContractValidationError("Explanation payload is invalid.");
  }
  return value as unknown as OutfitExplanationV1;
}

export interface FakeExplanationOptions {
  latencyMs?: number;
  now?: () => string;
}

export class FakeGeminiExplanationAdapter implements OutfitExplanationPort {
  readonly adapterName = "fake-gemini-explainer-v1";
  private readonly latencyMs: number;
  private readonly now: () => string;
  private failNextRequest = false;

  constructor(options: FakeExplanationOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  failNext(): void {
    this.failNextRequest = true;
  }

  async explain(request: OutfitExplanationRequestV1): Promise<OutfitExplanationV1> {
    if (this.latencyMs) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    if (this.failNextRequest) {
      this.failNextRequest = false;
      throw new Error("The explanation adapter was temporarily unavailable.");
    }
    if (request.contractVersion !== OUTFIT_EXPLANATION_CONTRACT_VERSION) {
      throw new Error("The local explanation adapter only supports contract 1.0.");
    }
    const factors = [...request.candidate.scoreBreakdown].sort(
      (left, right) => right.weightedPoints - left.weightedPoints || left.key.localeCompare(right.key),
    );
    const strongest = factors.slice(0, 2);
    const tradeoffs = factors
      .filter((entry) => entry.score < 65)
      .slice(0, 2)
      .map((entry) => entry.detail);
    const response = {
      contractVersion: OUTFIT_EXPLANATION_CONTRACT_VERSION,
      requestId: request.requestId,
      adapter: this.adapterName,
      generatedAt: this.now(),
      headline: `${request.candidate.personalMatch}% match, grounded in real availability`,
      rationale: `${strongest.map((entry) => entry.detail).join(" ")} The wording explains an existing deterministic result; it did not choose or score the garments.`,
      tradeoffs,
      citedFactorKeys: strongest.map((entry) => entry.key),
    };
    return parseOutfitExplanation(
      response,
      request.candidate.scoreBreakdown.map((entry) => entry.key),
    );
  }
}
