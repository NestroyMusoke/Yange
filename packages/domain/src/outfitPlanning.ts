import type {
  Garment,
  MatchFactor,
  MatchFactorKey,
  OutfitCandidate,
  PlanningContext,
  TwinState,
} from "./types";

const ENGINE_VERSION = "personal-match-v1" as const;
const MAX_COMBINATIONS = 120;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function words(garments: Garment[]): string {
  return garments
    .map((garment) => `${garment.name} ${garment.colour} ${garment.material}`)
    .join(" ")
    .toLowerCase();
}

function includesAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function candidateSignals(garments: Garment[]): string[] {
  const value = words(garments);
  const signals = new Set<string>();
  if (includesAny(value, ["cream", "ivory", "olive", "chocolate", "terracotta", "gold"])) {
    signals.add("warm-neutral");
  }
  if (includesAny(value, ["jacket", "poplin", "trousers", "column", "loafers"])) {
    signals.add("structured");
  }
  if (includesAny(value, ["wide-leg", "column skirt", "trousers"])) {
    signals.add("high-waist");
  }
  if (includesAny(value, ["linen", "cotton", "modal"])) signals.add("breathable");
  if (garments.some((garment) => garment.category === "accessory")) signals.add("polished");
  return [...signals].sort();
}

function factor(
  key: MatchFactorKey,
  label: string,
  score: number,
  weight: number,
  evidence: string[],
  detail: string,
): MatchFactor {
  const normalized = clamp(score);
  return {
    key,
    label,
    score: normalized,
    weight,
    weightedPoints: Math.round(normalized * weight) / 100,
    evidence,
    detail,
  };
}

function colourFactor(state: TwinState, garments: Garment[]): MatchFactor {
  const profile = state.styleProfile;
  const values = garments.map((garment) => garment.colour.toLowerCase());
  const preferred = values.filter((value) =>
    profile.preferredColours.some((colour) => value.includes(colour.toLowerCase())),
  );
  const avoided = values.filter((value) =>
    profile.avoidedColours.some((colour) => value.includes(colour.toLowerCase())),
  );
  const warmWords = ["cream", "ivory", "olive", "chocolate", "terracotta", "gold", "brown"];
  const coolWords = ["indigo", "blue", "violet", "plum", "silver", "black"];
  const relationshipMatches = values.filter((value) =>
    profile.colourRelationship === "warm"
      ? includesAny(value, warmWords)
      : profile.colourRelationship === "cool"
        ? includesAny(value, coolWords)
        : false,
  ).length;
  const relationshipBonus = ["neutral", "exploring", "not-set"].includes(
    profile.colourRelationship,
  )
    ? 6
    : (relationshipMatches / Math.max(1, values.length)) * 16;
  const score =
    52 +
    (preferred.length / Math.max(1, values.length)) * 42 -
    (avoided.length / Math.max(1, values.length)) * 60 +
    relationshipBonus;

  return factor(
    "colour",
    "Colour relationship",
    score,
    25,
    [
      ...preferred.map((colour) => `preferred:${colour}`),
      `relationship:${profile.colourRelationship}`,
      ...avoided.map((colour) => `suggest-less:${colour}`),
    ],
    avoided.length
      ? `${avoided.length} colour signal is on your suggest-less list.`
      : preferred.length
        ? `${preferred.length} garment colour ${preferred.length === 1 ? "echoes" : "echo"} your saved palette.`
        : "The palette is compatible, but not yet strongly evidenced by your saved colours.",
  );
}

function styleFactor(state: TwinState, garments: Garment[], signals: string[]): MatchFactor {
  const value = words(garments);
  const profile = state.styleProfile;
  const explicitSignals = new Set<string>();
  const fitMatches: Record<string, string[]> = {
    tailored: ["jacket", "poplin", "trousers", "loafers"],
    relaxed: ["wide-leg", "linen", "knit", "soft"],
    oversized: ["overshirt", "wide-leg"],
    "defined-waist": ["column skirt", "trousers", "wide-leg"],
    straight: ["column", "straight", "poplin"],
  };
  for (const preference of profile.fitPreferences) {
    if (includesAny(value, fitMatches[preference] ?? [])) explicitSignals.add(`fit:${preference}`);
  }
  const comfortMatches: Record<string, string[]> = {
    breathable: ["linen", "cotton", "modal"],
    "easy-movement": ["wide-leg", "skirt", "knit", "viscose"],
    "soft-textures": ["knit", "modal", "viscose"],
    coverage: ["jacket", "shirt", "outerwear"],
    "low-maintenance": ["machine-cold", "cotton"],
  };
  for (const priority of profile.comfortPriorities) {
    if (includesAny(value, comfortMatches[priority] ?? [])) explicitSignals.add(`comfort:${priority}`);
  }
  for (const word of profile.styleWords) {
    const matched =
      (word === "polished" && includesAny(value, ["jacket", "loafers", "earrings", "poplin"])) ||
      (word === "calm" && includesAny(value, ["cream", "ivory", "olive", "chocolate"])) ||
      (word === "textural" && includesAny(value, ["linen", "knit", "twill", "viscose"])) ||
      (word === "playful" && includesAny(value, ["terracotta", "gold", "skirt"]));
    if (matched) explicitSignals.add(`word:${word}`);
  }

  const proportionEvidence: string[] = [];
  let proportionAdjustment = 0;
  if (profile.heightCm !== null) {
    const heightBand = profile.heightCm < 160 ? "shorter" : profile.heightCm > 175 ? "taller" : "middle";
    proportionEvidence.push(`proportion:height:${profile.heightCm}`, `proportion:band:${heightBand}`);
    if (heightBand === "shorter" && includesAny(value, ["cropped", "high-waist", "defined waist", "column"])) {
      proportionAdjustment += 7;
      proportionEvidence.push("proportion:compact-length-relationship");
    }
    if (heightBand === "taller" && includesAny(value, ["wide-leg", "longline", "maxi", "column"])) {
      proportionAdjustment += 7;
      proportionEvidence.push("proportion:extended-line-relationship");
    }
    if (heightBand === "middle" && includesAny(value, ["straight", "cropped", "wide-leg", "column"])) {
      proportionAdjustment += 4;
      proportionEvidence.push("proportion:balanced-length-relationship");
    }
  }

  const explicitTotal =
    profile.fitPreferences.length + profile.comfortPriorities.length + profile.styleWords.length;
  const explicitScore = clamp(48 + (explicitSignals.size / Math.max(1, explicitTotal)) * 52 + proportionAdjustment);
  const observed = signals
    .map((signal) => state.styleMemory.signals[signal])
    .filter((signal) => signal && signal.observations > 0);
  const memoryScore = observed.length
    ? (observed.reduce((total, signal) => total + signal.score * signal.certainty, 0) /
        observed.reduce((total, signal) => total + signal.certainty, 0)) *
      100
    : 50;
  const score = explicitScore * 0.75 + memoryScore * 0.25;

  return factor(
    "style-memory",
    "Style & confidence memory",
    score,
    20,
    [...explicitSignals, ...proportionEvidence, ...observed.map((signal) => `confidence:${signal.key}`)].sort(),
    observed.length
      ? `${explicitSignals.size} explicit preferences, proportion context and ${observed.length} lived-confidence signal shape this score.`
      : profile.heightCm !== null
        ? `${explicitSignals.size} explicit preferences match. Height only tunes length and layering relationships; confidence evidence will refine them after wear.`
        : `${explicitSignals.size} explicit preferences match; confidence evidence will refine the score after wear.`,
  );
}

function contextFactor(context: PlanningContext, garments: Garment[]): MatchFactor {
  const value = words(garments);
  const hasOuterwear = garments.some((garment) => garment.category === "outerwear");
  const hasAccessory = garments.some((garment) => garment.category === "accessory");
  const breathable = includesAny(value, ["linen", "cotton", "modal"]);
  let score = 62;
  const evidence = [
    `occasion:${context.calendar.occasion}`,
    `dress:${context.calendar.dressCode}`,
    `temperature:${context.weather.temperatureC}`,
    `rain:${context.weather.precipitationProbability}`,
  ];

  if (["dinner", "formal", "creative-work"].includes(context.calendar.occasion)) {
    score += hasOuterwear ? 10 : -4;
    score += hasAccessory ? 7 : 0;
  }
  if (context.calendar.dressCode === "formal") score += hasOuterwear ? 8 : -14;
  if (context.calendar.dressCode === "polished") score += hasAccessory ? 5 : 0;
  if (context.weather.temperatureC >= 27) {
    score += breathable ? 14 : -8;
    score += hasOuterwear ? -8 : 4;
  }
  if (context.weather.temperatureC <= 20) score += hasOuterwear ? 16 : -16;
  if (context.weather.precipitationProbability >= 40) {
    score += hasOuterwear ? 6 : -12;
    evidence.push("tradeoff:rain-protection-not-verified");
  }
  if (context.inspirationLookId) score += 4;

  return factor(
    "context",
    "Occasion & weather",
    score,
    25,
    evidence,
    context.weather.precipitationProbability >= 40 && !hasOuterwear
      ? "The silhouette fits the occasion, but rain protection is not represented in the available layers."
      : `Balanced for ${context.calendar.title.toLowerCase()} at ${context.weather.temperatureC}°C.`,
  );
}

function careFactor(state: TwinState, garments: Garment[]): MatchFactor {
  const clothing = garments.filter((garment) =>
    ["top", "bottom", "outerwear"].includes(garment.category),
  );
  const machine = clothing.filter((garment) =>
    garment.careProfile.wash.value.startsWith("machine"),
  ).length;
  const hand = clothing.filter((garment) => garment.careProfile.wash.value === "hand-wash").length;
  const dryClean = clothing.filter((garment) => garment.careProfile.wash.value === "dry-clean").length;
  const unknown = clothing.filter((garment) => garment.careProfile.wash.value === "unknown").length;
  const lowMaintenance = state.styleProfile.comfortPriorities.includes("low-maintenance");
  const score = 72 + machine * 5 - hand * 10 - dryClean * 24 - unknown * 18 + (lowMaintenance ? machine * 3 : 0);
  return factor(
    "care-practicality",
    "Care practicality",
    score,
    10,
    [`machine:${machine}`, `hand:${hand}`, `professional:${dryClean}`, `unknown:${unknown}`],
    dryClean || unknown
      ? "This look carries a higher care burden or incomplete care evidence."
      : hand
        ? "One delicate-care piece makes this look slightly more demanding after wear."
        : "The clothing pieces share familiar home-care methods.",
  );
}

function candidateName(garments: Garment[], context: PlanningContext): string {
  const top = garments.find((garment) => garment.category === "top");
  const bottom = garments.find((garment) => garment.category === "bottom");
  const occasionNames: Record<PlanningContext["calendar"]["occasion"], string> = {
    "creative-work": "Studio",
    casual: "Off-duty",
    dinner: "After-dark",
    formal: "Ceremony",
    travel: "In-transit",
  };
  const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const first = titleCase(top?.colour.split(" ").at(-1) ?? "Wardrobe");
  const second = titleCase(bottom?.colour.split(" ").at(-1) ?? "Edit");
  return `${first} & ${second} ${occasionNames[context.calendar.occasion]}`;
}

export function generateOutfitCandidates(
  state: TwinState,
  context: PlanningContext,
  limit = 6,
): OutfitCandidate[] {
  const usable = Object.values(state.garments)
    .filter((garment) => !garment.archived && (garment.state === "available" || garment.state === "rewearable"))
    .sort((left, right) => left.id.localeCompare(right.id));
  const byCategory = (category: Garment["category"]) =>
    usable.filter((garment) => garment.category === category);
  const tops = byCategory("top");
  const bottoms = byCategory("bottom");
  const shoes = byCategory("shoes");
  const outerwear: Array<Garment | null> = [null, ...byCategory("outerwear")];
  const accessories: Array<Garment | null> = [null, ...byCategory("accessory")];
  if (!tops.length || !bottoms.length || !shoes.length) return [];

  const candidates: OutfitCandidate[] = [];
  let evaluated = 0;
  outer: for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        for (const layer of outerwear) {
          for (const accessory of accessories) {
            if (evaluated >= MAX_COMBINATIONS) break outer;
            evaluated += 1;
            const garments = [top, bottom, shoe, layer, accessory].filter(
              (garment): garment is Garment => garment !== null,
            );
            const garmentIds = garments.map((garment) => garment.id).sort();
            const signals = candidateSignals(garments);
            const scoreBreakdown = [
              factor(
                "availability",
                "Real availability",
                100,
                20,
                garments.map((garment) => `${garment.id}:${garment.state}`),
                "Every selected piece is currently available in the Wardrobe Digital Twin.",
              ),
              colourFactor(state, garments),
              styleFactor(state, garments, signals),
              contextFactor(context, garments),
              careFactor(state, garments),
            ];
            const personalMatch = clamp(
              scoreBreakdown.reduce((total, entry) => total + entry.weightedPoints, 0),
            );
            const fingerprint = JSON.stringify({ garmentIds, context, engine: ENGINE_VERSION });
            candidates.push({
              id: `candidate-${stableHash(fingerprint)}`,
              engineVersion: ENGINE_VERSION,
              name: candidateName(garments, context),
              garmentIds,
              personalMatch,
              scoreBreakdown,
              styleSignals: signals,
              context: structuredClone(context),
              constraintTrace: [
                "one-top",
                "one-bottom",
                "one-pair-of-shoes",
                layer ? "one-outer-layer" : "outer-layer-optional",
                accessory ? "one-accessory" : "accessory-optional",
                "all-garments-usable-and-unreserved",
              ],
            });
          }
        }
      }
    }
  }

  return candidates
    .sort(
      (left, right) =>
        right.personalMatch - left.personalMatch || left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(1, Math.min(12, limit)));
}
