import type { ColourEvidence, ColourEvidenceDirection, Garment } from "./types";

const NAMED_COLOURS: Record<string, { family: string; hex: string }> = {
  black: { family: "black", hex: "#26282A" },
  blue: { family: "blue", hex: "#367FA8" },
  blush: { family: "rose", hex: "#C9828B" },
  brown: { family: "brown", hex: "#72513E" },
  burgundy: { family: "burgundy", hex: "#74394B" },
  camel: { family: "camel", hex: "#B38459" },
  charcoal: { family: "charcoal", hex: "#43484D" },
  chocolate: { family: "chocolate", hex: "#6E4937" },
  coral: { family: "coral", hex: "#D47367" },
  cream: { family: "cream", hex: "#D8C7A7" },
  cyan: { family: "cyan", hex: "#2C9FBB" },
  emerald: { family: "emerald", hex: "#2D9B72" },
  gold: { family: "gold", hex: "#B99B55" },
  green: { family: "green", hex: "#4B916C" },
  grey: { family: "grey", hex: "#74787A" },
  indigo: { family: "indigo", hex: "#46548F" },
  ivory: { family: "cream", hex: "#E3DCCB" },
  khaki: { family: "khaki", hex: "#858363" },
  lavender: { family: "violet", hex: "#8E76B2" },
  lilac: { family: "violet", hex: "#9B7FB3" },
  navy: { family: "navy", hex: "#344A69" },
  neutral: { family: "neutral", hex: "#A89578" },
  olive: { family: "olive", hex: "#66744D" },
  orange: { family: "orange", hex: "#C77645" },
  pink: { family: "rose", hex: "#C97991" },
  plum: { family: "plum", hex: "#724D74" },
  purple: { family: "violet", hex: "#74579A" },
  red: { family: "red", hex: "#A84E55" },
  rose: { family: "rose", hex: "#B9637C" },
  rust: { family: "rust", hex: "#A85E3F" },
  silver: { family: "silver", hex: "#93999C" },
  tan: { family: "tan", hex: "#AD835E" },
  teal: { family: "teal", hex: "#318A89" },
  terracotta: { family: "terracotta", hex: "#A95F45" },
  turquoise: { family: "teal", hex: "#329B9B" },
  violet: { family: "violet", hex: "#7655A0" },
  white: { family: "cream", hex: "#DDDCD7" },
  yellow: { family: "yellow", hex: "#C5A94C" },
};

export interface NormalisedColour {
  family: string;
  exactHex: string;
  label: string;
}

export function normaliseColour(value: string): NormalisedColour | null {
  const compact = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(compact)) {
    const exactHex = `#${compact.toUpperCase()}`;
    return { family: `custom-${compact.toLowerCase()}`, exactHex, label: exactHex };
  }
  const words = value.toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ");
  const key = Object.keys(NAMED_COLOURS)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => words.includes(candidate));
  if (!key) return null;
  const colour = NAMED_COLOURS[key];
  return { family: colour.family, exactHex: colour.hex, label: key };
}

export function colourEvidenceForConfidence(input: {
  garments: Garment[];
  outfitId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  operationId: string;
  occurredAt: string;
}): ColourEvidence[] {
  const sentiment = (input.rating - 3) / 2;
  if (sentiment === 0) return [];
  const direction: ColourEvidenceDirection = sentiment > 0 ? "positive" : "negative";
  const explicit = (direction === "positive" && input.tags.includes("loved-colour"))
    || (direction === "negative" && input.tags.includes("colour-missed"));
  const valid = input.garments
    .map((garment) => ({ garment, colour: normaliseColour(garment.colour) }))
    .filter((entry): entry is { garment: Garment; colour: NormalisedColour } => entry.colour !== null);
  const divisor = Math.sqrt(Math.max(1, valid.length));
  const base = explicit ? 0.95 : 0.34;

  return valid.map(({ garment, colour }, index) => ({
    id: `${input.operationId}:colour-${index}`,
    colourFamily: colour.family,
    exactHex: colour.exactHex,
    label: colour.label,
    source: "confidence-check-in",
    direction,
    strength: Math.min(1, Math.abs(sentiment) * base / divisor),
    attribution: explicit ? "user-attributed" : "outfit-inferred",
    garmentId: garment.id,
    outfitId: input.outfitId,
    occurredAt: input.occurredAt,
  }));
}
