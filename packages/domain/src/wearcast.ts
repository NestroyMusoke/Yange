import { createLaundryPlan } from "./laundry";
import { generateOutfitCandidates } from "./outfitPlanning";
import type {
  CalendarSnapshot,
  DryingSuitability,
  DryingWindowAssessment,
  ForecastPeriod,
  LaundryWindowProposal,
  Outfit,
  OutfitDependencyRisk,
  PlanningContext,
  SevenDayForecast,
  TwinState,
  WardrobeCapacityRisk,
  WearCastDecision,
  WearCastRiskSeverity,
} from "./types";

const CAPACITY_THRESHOLD = 0.5;

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

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid WearCast timestamp: ${value}`);
  return parsed;
}

function unavailableForCommitment(state: TwinState, outfit: Outfit): string[] {
  return outfit.dependencies.filter((id) => {
    const garment = state.garments[id];
    return !garment || ["laundry", "drying", "airing"].includes(garment.state);
  });
}

function riskSeverity(hoursRemaining: number, blocked: number): WearCastRiskSeverity {
  if (hoursRemaining <= 12 || blocked >= 3) return "critical";
  if (hoursRemaining <= 36 || blocked >= 2) return "warning";
  return "watch";
}

function assessCapacity(state: TwinState): WardrobeCapacityRisk {
  const core = Object.values(state.garments).filter((garment) =>
    ["top", "bottom", "outerwear"].includes(garment.category),
  );
  const affected = core
    .filter((garment) => ["laundry", "drying", "airing"].includes(garment.state))
    .map((garment) => garment.id)
    .sort();
  const ratio = core.length ? affected.length / core.length : 0;
  return {
    threshold: CAPACITY_THRESHOLD,
    ratio,
    unavailableCount: affected.length,
    totalCoreClothing: core.length,
    affectedGarmentIds: affected,
    triggered: ratio >= CAPACITY_THRESHOLD,
  };
}

function suitability(score: number, outdoorSafe: boolean): DryingSuitability {
  if (!outdoorSafe) return "unsafe";
  if (score >= 82) return "excellent";
  if (score >= 65) return "good";
  return "limited";
}

export function assessDryingPeriod(period: ForecastPeriod): DryingWindowAssessment {
  const reasons: string[] = [];
  let score = 92;
  score -= period.precipitationProbability * 0.7;
  if (period.precipitationProbability <= 20) reasons.push("low-rain-probability");
  else reasons.push(`rain-risk:${period.precipitationProbability}`);
  if (period.humidityPercent > 60) {
    score -= (period.humidityPercent - 60) * 0.55;
    reasons.push(`humidity:${period.humidityPercent}`);
  } else {
    score += 5;
    reasons.push("lower-humidity");
  }
  if (period.temperatureC >= 22) {
    score += 7;
    reasons.push(`warm-air:${period.temperatureC}`);
  } else if (period.temperatureC < 17) {
    score -= 12;
    reasons.push(`cool-air:${period.temperatureC}`);
  }
  if (period.windKph >= 5 && period.windKph <= 22) {
    score += 8;
    reasons.push(`useful-airflow:${period.windKph}`);
  } else if (period.windKph > 32) {
    score -= 24;
    reasons.push(`unsafe-wind:${period.windKph}`);
  } else {
    reasons.push(`light-airflow:${period.windKph}`);
  }
  if (period.daylight) {
    score += 5;
    reasons.push("daylight");
  } else {
    score -= 24;
    reasons.push("no-daylight");
  }
  if (period.condition === "rain") score -= 28;
  if (period.condition === "showers") score -= 12;
  const outdoorSafe =
    period.daylight &&
    period.condition !== "rain" &&
    period.precipitationProbability <= 35 &&
    period.humidityPercent <= 88 &&
    period.windKph <= 32;
  const normalized = clamp(score);
  return {
    periodId: period.id,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    score: normalized,
    suitability: suitability(normalized, outdoorSafe),
    outdoorSafe,
    reasons,
  };
}

function inferCalendar(outfit: Outfit, period: ForecastPeriod): CalendarSnapshot {
  const value = `${outfit.occasion} ${outfit.name}`.toLowerCase();
  const occasion = value.includes("dinner") || value.includes("rooftop")
    ? "dinner"
    : value.includes("travel")
      ? "travel"
      : value.includes("work")
        ? "creative-work"
        : "casual";
  return {
    source: "wearcast-derived-calendar-v1",
    eventId: outfit.id,
    title: outfit.name,
    startsAt: outfit.scheduledAt ?? period.endsAt,
    occasion,
    dressCode: occasion === "dinner" ? "polished" : "smart-casual",
    notes: "Derived from an existing planned outfit for non-destructive recovery simulation.",
  };
}

function planningContext(
  forecast: SevenDayForecast,
  outfit: Outfit,
  period: ForecastPeriod,
): PlanningContext {
  return {
    version: 1,
    weather: {
      source: forecast.source,
      location: forecast.location,
      observedAt: forecast.issuedAt,
      temperatureC: period.temperatureC,
      precipitationProbability: period.precipitationProbability,
      condition: period.condition,
    },
    calendar: inferCalendar(outfit, period),
    inspirationLookId: null,
  };
}

function forecastPeriodFor(forecast: SevenDayForecast, dueAt: string): ForecastPeriod {
  const due = timestamp(dueAt);
  return [...forecast.periods].sort((left, right) => {
    const leftDistance = Math.abs(timestamp(left.startsAt) - due);
    const rightDistance = Math.abs(timestamp(right.startsAt) - due);
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  })[0];
}

function proposal(
  clusterId: string,
  garmentIds: string[],
  window: DryingWindowAssessment,
  deadline: string,
  now: string,
): LaundryWindowProposal {
  const washAt = new Date(
    Math.max(timestamp(now), timestamp(window.startsAt) - 90 * 60_000),
  ).toISOString();
  const fingerprint = `${clusterId}|${garmentIds.join("|")}|${window.periodId}|${deadline}`;
  return {
    id: `laundry-window-${stableHash(fingerprint)}`,
    clusterId,
    garmentIds: [...garmentIds].sort(),
    washAt,
    dryFrom: window.startsAt,
    dryUntil: window.endsAt,
    deadline,
    suitabilityScore: window.score,
    outdoorRecommended: window.outdoorSafe,
    basis: [
      ...window.reasons,
      `forecast-period:${window.periodId}`,
      "care-label-drying-method-remains-authoritative",
    ],
  };
}

export function evaluateWearCast(
  state: TwinState,
  forecast: SevenDayForecast,
  generatedAt: string,
): WearCastDecision {
  const now = timestamp(generatedAt);
  const horizon = Math.max(...forecast.periods.map((period) => timestamp(period.endsAt)));
  const risks: OutfitDependencyRisk[] = Object.values(state.outfits)
    .filter((outfit) => outfit.status === "planned" && outfit.scheduledAt)
    .filter((outfit) => timestamp(outfit.scheduledAt as string) > now && timestamp(outfit.scheduledAt as string) <= horizon)
    .map((outfit) => {
      const unavailableGarmentIds = unavailableForCommitment(state, outfit);
      const hoursRemaining = Math.round(((timestamp(outfit.scheduledAt as string) - now) / 3_600_000) * 10) / 10;
      return {
        outfitId: outfit.id,
        dueAt: outfit.scheduledAt as string,
        hoursRemaining,
        unavailableGarmentIds,
        severity: riskSeverity(hoursRemaining, unavailableGarmentIds.length),
      };
    })
    .filter((risk) => risk.unavailableGarmentIds.length > 0)
    .sort((left, right) => timestamp(left.dueAt) - timestamp(right.dueAt) || left.outfitId.localeCompare(right.outfitId));
  const capacity = assessCapacity(state);
  const dryingWindows = forecast.periods
    .filter((period) => timestamp(period.endsAt) > now)
    .map(assessDryingPeriod)
    .sort((left, right) => right.score - left.score || timestamp(left.startsAt) - timestamp(right.startsAt));
  const primaryRisk = risks[0] ?? null;
  const deadline = primaryRisk?.dueAt ?? new Date(horizon).toISOString();
  const bestWindow = dryingWindows.find(
    (window) =>
      window.outdoorSafe &&
      window.score >= 65 &&
      timestamp(window.endsAt) <= timestamp(deadline),
  ) ?? null;
  const laundryPlan = createLaundryPlan(state);
  const neededIds = new Set(risks.flatMap((risk) => risk.unavailableGarmentIds));
  const laundryProposals = bestWindow
    ? laundryPlan.clusters
        .filter((cluster) => cluster.garmentIds.some((id) => neededIds.has(id)))
        .map((cluster) => proposal(cluster.id, cluster.garmentIds, bestWindow, deadline, generatedAt))
    : [];
  let fallbackCandidate = null;
  let fallbackForOutfitId: string | null = null;
  if (primaryRisk) {
    const outfit = state.outfits[primaryRisk.outfitId];
    const period = forecastPeriodFor(forecast, primaryRisk.dueAt);
    fallbackCandidate = generateOutfitCandidates(state, planningContext(forecast, outfit, period), 1)[0] ?? null;
    fallbackForOutfitId = fallbackCandidate ? primaryRisk.outfitId : null;
  }
  const notifications = [];
  if (capacity.triggered) {
    notifications.push({
      id: `notification-capacity-${stableHash(`${capacity.affectedGarmentIds.join("|")}|${generatedAt}`)}`,
      kind: "wardrobe-capacity" as const,
      severity: capacity.ratio >= 0.75 ? "critical" as const : "warning" as const,
      title: "Half your core wardrobe is out of rotation",
      body: `${capacity.unavailableCount} of ${capacity.totalCoreClothing} core clothing pieces are in laundry, drying, or airing.`,
      relatedOutfitId: primaryRisk?.outfitId ?? null,
      relatedGarmentIds: capacity.affectedGarmentIds,
    });
  }
  if (primaryRisk) {
    notifications.push({
      id: `notification-risk-${stableHash(`${primaryRisk.outfitId}|${generatedAt}`)}`,
      kind: "laundry-risk" as const,
      severity: primaryRisk.severity,
      title: `${state.outfits[primaryRisk.outfitId].name} needs attention`,
      body: bestWindow
        ? `WearCast found a ${bestWindow.score}% drying opportunity before the event and prepared a fallback.`
        : "No forecast-safe outdoor drying opportunity finishes before the event; a fallback is safer.",
      relatedOutfitId: primaryRisk.outfitId,
      relatedGarmentIds: primaryRisk.unavailableGarmentIds,
    });
  }
  if (fallbackCandidate && primaryRisk) {
    notifications.push({
      id: `notification-fallback-${stableHash(`${fallbackCandidate.id}|${generatedAt}`)}`,
      kind: "outfit-recovery" as const,
      severity: "watch" as const,
      title: "A fallback look is ready",
      body: `${fallbackCandidate.name} uses ${fallbackCandidate.garmentIds.length} currently feasible pieces at ${fallbackCandidate.personalMatch}% Personal Match.`,
      relatedOutfitId: primaryRisk.outfitId,
      relatedGarmentIds: fallbackCandidate.garmentIds,
    });
  }
  const protectedOutfitIds = fallbackForOutfitId ? [fallbackForOutfitId] : [];
  const decisionFingerprint = JSON.stringify({
    generatedAt,
    forecast,
    garmentStates: Object.values(state.garments).map((garment) => [garment.id, garment.state]).sort(),
    plannedOutfits: Object.values(state.outfits).map((outfit) => [outfit.id, outfit.status, outfit.scheduledAt]).sort(),
  });
  return {
    engineVersion: "wearcast-v1",
    decisionId: `wearcast-${stableHash(decisionFingerprint)}`,
    generatedAt,
    horizonEndsAt: new Date(horizon).toISOString(),
    forecast: structuredClone(forecast),
    risks,
    capacity,
    dryingWindows,
    laundryProposals,
    fallbackCandidate,
    fallbackForOutfitId,
    notifications,
    scenarios: {
      doNothing: {
        mode: "do-nothing",
        protectedOutfitIds: [],
        unresolvedOutfitIds: risks.map((risk) => risk.outfitId),
        scheduledLaundryWindows: 0,
        fallbackReserved: false,
        summary: risks.length
          ? `${risks.length} planned outfit ${risks.length === 1 ? "remains" : "remain"} exposed to unavailable garments.`
          : "No planned outfit conflicts are visible inside the forecast horizon.",
      },
      autopilot: {
        mode: "autopilot",
        protectedOutfitIds,
        unresolvedOutfitIds: risks.map((risk) => risk.outfitId).filter((id) => !protectedOutfitIds.includes(id)),
        scheduledLaundryWindows: laundryProposals.length,
        fallbackReserved: fallbackCandidate !== null,
        summary: fallbackCandidate
          ? `A verified fallback protects the nearest event while ${laundryProposals.length} laundry ${laundryProposals.length === 1 ? "window is" : "windows are"} scheduled.`
          : "WearCast exposes the risk but will not invent a fallback without a feasible complete outfit.",
      },
    },
    decisionTrace: [
      `forecast:${forecast.source}`,
      `horizon-periods:${forecast.periods.length}`,
      `planned-outfit-risks:${risks.length}`,
      `capacity-ratio:${capacity.ratio.toFixed(2)}`,
      `safe-drying-window:${bestWindow?.periodId ?? "none"}`,
      `fallback:${fallbackCandidate?.id ?? "none"}`,
      "simulation-did-not-mutate-live-state",
    ],
  };
}
