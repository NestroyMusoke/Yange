import type {
  GarmentCategory,
  GarmentState,
  ReadinessResult,
  TwinState,
} from "./types";

const immediatelyUsable = new Set<GarmentState>([
  "available",
  "reserved",
  "rewearable",
]);

export function isGarmentUsable(state: GarmentState): boolean {
  return immediatelyUsable.has(state);
}

export function calculateReadiness(state: TwinState): ReadinessResult {
  const garments = Object.values(state.garments);
  const wardrobeGarments = garments.filter(
    (garment) => garment.category !== "accessory",
  );
  const availableGarments = wardrobeGarments.filter((garment) =>
    isGarmentUsable(garment.state),
  ).length;
  const availabilityRatio = wardrobeGarments.length
    ? availableGarments / wardrobeGarments.length
    : 0;

  const essentialCategories: GarmentCategory[] = ["top", "bottom", "shoes"];
  const missingEssentialCategories = essentialCategories.filter(
    (category) =>
      !garments.some(
        (garment) =>
          garment.category === category && isGarmentUsable(garment.state),
      ),
  );
  const categoryCoverage =
    (essentialCategories.length - missingEssentialCategories.length) /
    essentialCategories.length;

  const plannedOutfits = Object.values(state.outfits).filter(
    (outfit) => outfit.status === "planned",
  );
  const atRiskOutfitIds = plannedOutfits
    .filter((outfit) =>
      outfit.garmentIds.some(
        (id) => !state.garments[id] || !isGarmentUsable(state.garments[id].state),
      ),
    )
    .map((outfit) => outfit.id);
  const feasibleOutfits = plannedOutfits.length - atRiskOutfitIds.length;
  const plannedCoverage = plannedOutfits.length
    ? feasibleOutfits / plannedOutfits.length
    : 1;

  const score = Math.round(
    availabilityRatio * 50 + categoryCoverage * 30 + plannedCoverage * 20,
  );
  const level =
    score >= 80
      ? "ready"
      : score >= 60
        ? "building"
        : score >= 40
          ? "limited"
          : "emergency";

  return {
    score,
    level,
    availableGarments,
    totalGarments: wardrobeGarments.length,
    feasibleOutfits,
    plannedOutfits: plannedOutfits.length,
    atRiskOutfitIds,
    missingEssentialCategories,
  };
}

