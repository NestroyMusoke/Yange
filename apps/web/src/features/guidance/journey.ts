import type { ReadinessResult, TwinState } from "@yange/domain";
import type { YangeView } from "../judge/JudgeMode";

export type JourneyMilestoneId =
  | "essentials"
  | "personal"
  | "outfit"
  | "worn"
  | "memory";

export interface JourneyMilestone {
  id: JourneyMilestoneId;
  label: string;
  complete: boolean;
}

export interface JourneyAction {
  view: YangeView;
  eyebrow: string;
  title: string;
  detail: string;
  action: string;
}

export interface YangeJourney {
  milestones: JourneyMilestone[];
  completed: number;
  progress: number;
  next: JourneyAction;
}

const essentialCategories = ["top", "bottom", "shoes"] as const;

function activePersonalGarments(state: TwinState) {
  return Object.values(state.garments).filter(
    (garment) => garment.source === "user-added" && !garment.archived,
  );
}

export function deriveYangeJourney(
  state: TwinState,
  readiness: Pick<ReadinessResult, "atRiskOutfitIds">,
): YangeJourney {
  const garments = activePersonalGarments(state);
  const captured = new Set(garments.map((garment) => garment.category));
  const missing = essentialCategories.filter((category) => !captured.has(category));
  const personalOutfits = Object.values(state.outfits)
    .filter((outfit) => outfit.source === "agent-planned")
    .sort((left, right) => (right.scheduledAt ?? "").localeCompare(left.scheduledAt ?? ""));
  const latestOutfit = personalOutfits[0];
  const hasWornOutfit = personalOutfits.some((outfit) => outfit.status === "worn");
  const unreviewedWornOutfit = personalOutfits.find(
    (outfit) => outfit.status === "worn"
      && !state.feedback.some((feedback) => feedback.outfitId === outfit.id),
  );
  const atRisk = personalOutfits.some((outfit) => readiness.atRiskOutfitIds.includes(outfit.id));

  const milestones: JourneyMilestone[] = [
    { id: "essentials", label: "Wardrobe", complete: missing.length === 0 },
    { id: "personal", label: "My clothes", complete: state.wardrobeMode === "personal" },
    { id: "outfit", label: "First outfit", complete: personalOutfits.length > 0 },
    { id: "worn", label: "Worn", complete: hasWornOutfit },
    { id: "memory", label: "Style memory", complete: state.styleMemory.feedbackCount > 0 },
  ];
  const completed = milestones.filter((milestone) => milestone.complete).length;

  let next: JourneyAction;
  if (missing.length > 0) {
    const category = missing[0];
    const label = category === "shoes" ? "shoes" : `a ${category}`;
    next = {
      view: "studio",
      eyebrow: "Build your first real outfit",
      title: `Add ${label} next`,
      detail: `${essentialCategories.length - missing.length} of ${essentialCategories.length} essentials ready. A top, bottom and shoes unlock complete outfit suggestions.`,
      action: category === "shoes" ? "Add shoes" : `Add ${category}`,
    };
  } else if (state.wardrobeMode !== "personal") {
    next = {
      view: "studio",
      eyebrow: "Your essentials are ready",
      title: "Use only my clothes",
      detail: "Switch from the sample wardrobe so every recommendation is built entirely from pieces you confirmed.",
      action: "Make it personal",
    };
  } else if (!latestOutfit) {
    next = {
      view: "atelier",
      eyebrow: "Your wardrobe can dress you now",
      title: "Create your first outfit",
      detail: "Tell Yange where you are going. Weather, availability and your preferences will shape the options.",
      action: "Pick an outfit",
    };
  } else if (atRisk) {
    next = {
      view: "wearcast",
      eyebrow: "One plan needs attention",
      title: "Protect your upcoming outfit",
      detail: "Check the laundry and drying plan before a needed garment becomes unavailable.",
      action: "Check laundry",
    };
  } else if (unreviewedWornOutfit) {
    next = {
      view: "today",
      eyebrow: "Teach Yange from real life",
      title: "How did your outfit feel?",
      detail: "A quick Confidence Check-in helps future recommendations feel more like you.",
      action: "Share how it felt",
    };
  } else if (latestOutfit.status === "planned") {
    next = {
      view: "today",
      eyebrow: "Your outfit is ready",
      title: "See what Yange chose",
      detail: "Review the pieces, personal match and reasons before deciding whether to wear it.",
      action: "See my outfit",
    };
  } else {
    next = {
      view: "atelier",
      eyebrow: "Your wardrobe is working",
      title: "What are you dressing for next?",
      detail: "Plan another occasion or upload inspiration when you want a fresh direction.",
      action: "Plan an outfit",
    };
  }

  return {
    milestones,
    completed,
    progress: Math.round((completed / milestones.length) * 100),
    next,
  };
}
