import type { TwinState } from "@yange/domain";

export type AuraRgb = readonly [number, number, number];

export interface StyleAuraProfile {
  colours: readonly [string, string, string, string];
  labels: readonly string[];
  evidenceCount: number;
  confidence: number;
  stage: "foundation" | "learning" | "personal";
  sources: {
    explicitPreferences: number;
    inspirationPalettes: number;
    confidenceSignals: number;
    confirmedGarments: number;
  };
}

interface WeightedColour {
  hex: string;
  label: string;
  weight: number;
  order: number;
}

export const FOUNDATION_AURA = [
  "#48306F",
  "#278EAA",
  "#2C9B73",
  "#A85C76",
] as const;

const NAMED_COLOURS: Record<string, string> = {
  black: "#26282A",
  blue: "#367FA8",
  blush: "#C9828B",
  brown: "#72513E",
  burgundy: "#74394B",
  camel: "#B38459",
  charcoal: "#43484D",
  chocolate: "#6E4937",
  coral: "#D47367",
  cream: "#D8C7A7",
  cyan: "#2C9FBB",
  emerald: "#2D9B72",
  gold: "#B99B55",
  green: "#4B916C",
  grey: "#74787A",
  indigo: "#46548F",
  ivory: "#E3DCCB",
  khaki: "#858363",
  lavender: "#8E76B2",
  lilac: "#9B7FB3",
  navy: "#344A69",
  neutral: "#A89578",
  olive: "#66744D",
  orange: "#C77645",
  pink: "#C97991",
  plum: "#724D74",
  purple: "#74579A",
  red: "#A84E55",
  rose: "#B9637C",
  rust: "#A85E3F",
  silver: "#93999C",
  tan: "#AD835E",
  teal: "#318A89",
  terracotta: "#A95F45",
  turquoise: "#329B9B",
  violet: "#7655A0",
  white: "#DDDCD7",
  yellow: "#C5A94C",
};

const SIGNAL_COLOURS: Record<string, string> = {
  "cool-neutral": "#577E99",
  "deep-neutral": "#594C58",
  "earth-tone": "#7A724C",
  "warm-neutral": "#A37C5E",
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function componentToHex(value: number): string {
  return Math.round(clamp(value) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function rgbToHex([red, green, blue]: AuraRgb): string {
  return `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
}

export function hexToAuraRgb(value: string): AuraRgb | null {
  const compact = value.trim().replace(/^#/, "");
  const expanded = compact.length === 3
    ? compact.split("").map((character) => `${character}${character}`).join("")
    : compact;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;

  return [
    Number.parseInt(expanded.slice(0, 2), 16) / 255,
    Number.parseInt(expanded.slice(2, 4), 16) / 255,
    Number.parseInt(expanded.slice(4, 6), 16) / 255,
  ];
}

export function resolveColour(value: string): string | null {
  const parsedHex = hexToAuraRgb(value);
  if (parsedHex) return rgbToHex(parsedHex);

  const normalised = value.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  const exact = NAMED_COLOURS[normalised];
  if (exact) return exact;

  const matchingName = Object.keys(NAMED_COLOURS)
    .sort((left, right) => right.length - left.length)
    .find((name) => normalised.split(" ").includes(name));
  return matchingName ? NAMED_COLOURS[matchingName] : null;
}

function luminance(colour: AuraRgb): number {
  return colour[0] * 0.2126 + colour[1] * 0.7152 + colour[2] * 0.0722;
}

function auraReady(hex: string): string {
  const colour = hexToAuraRgb(hex);
  if (!colour) return hex;
  const lightness = luminance(colour);
  const lift = lightness < 0.29 ? (0.29 - lightness) * 0.72 : 0;
  const lower = lightness > 0.79 ? (lightness - 0.79) * 0.58 : 0;
  return rgbToHex([
    clamp(colour[0] + lift - lower),
    clamp(colour[1] + lift - lower),
    clamp(colour[2] + lift - lower),
  ]);
}

function colourDistance(left: string, right: string): number {
  const a = hexToAuraRgb(left) ?? [0, 0, 0];
  const b = hexToAuraRgb(right) ?? [0, 0, 0];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function deriveStyleAuraProfile(state: TwinState): StyleAuraProfile {
  const candidates = new Map<string, WeightedColour>();
  let order = 0;
  const sources = {
    explicitPreferences: 0,
    inspirationPalettes: 0,
    confidenceSignals: 0,
    confirmedGarments: 0,
  };

  function add(raw: string, weight: number, label = raw) {
    const resolved = resolveColour(raw);
    if (!resolved || weight <= 0) return;
    const hex = auraReady(resolved);
    const existing = candidates.get(hex);
    if (existing) {
      existing.weight += weight;
      return;
    }
    candidates.set(hex, { hex, label, weight, order: order++ });
  }

  for (const colour of state.styleProfile.preferredColours) {
    sources.explicitPreferences += 1;
    add(colour, 4.2, colour);
  }

  for (const look of Object.values(state.inspirationLooks)) {
    for (const colour of look.palette) {
      sources.inspirationPalettes += 1;
      add(colour, 2.4 + clamp(look.confidence) * 1.4, `${look.name} palette`);
    }
  }

  for (const signal of Object.values(state.styleMemory.signals)) {
    if (signal.score <= 0 || signal.certainty <= 0) continue;
    const signalColour = SIGNAL_COLOURS[signal.key] ?? resolveColour(signal.key);
    if (!signalColour) continue;
    sources.confidenceSignals += 1;
    add(
      signalColour,
      1.2 + signal.score * signal.certainty * 3.2,
      `${signal.key} confidence signal`,
    );
  }

  for (const garment of Object.values(state.garments)) {
    if (garment.provenance.colour.reviewStatus !== "confirmed") continue;
    const resolved = resolveColour(garment.colour);
    if (!resolved) continue;
    sources.confirmedGarments += 1;
    const userWeight = garment.source === "user-added" ? 1.15 : 0.38;
    const wearWeight = Math.min(0.8, garment.wearsSinceWash * 0.18);
    add(resolved, userWeight + wearWeight, garment.colour);
  }

  const ranked = [...candidates.values()].sort(
    (left, right) => right.weight - left.weight || left.order - right.order,
  );
  const selected: WeightedColour[] = [];
  for (const candidate of ranked) {
    const tooSimilar = selected.some(
      (existing) => colourDistance(existing.hex, candidate.hex) < 0.105,
    );
    if (!tooSimilar) selected.push(candidate);
    if (selected.length === 4) break;
  }

  for (let index = 0; selected.length < 4; index += 1) {
    const foundation = FOUNDATION_AURA[index % FOUNDATION_AURA.length];
    if (!selected.some((candidate) => colourDistance(candidate.hex, foundation) < 0.105)) {
      selected.push({
        hex: foundation,
        label: "Yange foundation",
        weight: 0,
        order: order++,
      });
    }
  }

  const evidenceCount =
    sources.explicitPreferences +
    sources.inspirationPalettes +
    sources.confidenceSignals +
    sources.confirmedGarments;
  const personalEvidence =
    sources.explicitPreferences * 2 +
    sources.inspirationPalettes +
    sources.confidenceSignals * 2;
  const confidence = clamp(0.22 + personalEvidence * 0.055, 0.22, 0.96);
  const stage = personalEvidence >= 12
    ? "personal"
    : personalEvidence >= 4
      ? "learning"
      : "foundation";

  return {
    colours: selected.map((candidate) => candidate.hex) as [string, string, string, string],
    labels: selected.map((candidate) => candidate.label),
    evidenceCount,
    confidence,
    stage,
    sources,
  };
}

