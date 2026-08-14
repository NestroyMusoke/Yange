import type {
  BleachMethod,
  DryMethod,
  Garment,
  LaundryCluster,
  LaundryColourFamily,
  LaundryConflictRule,
  LaundryHoldout,
  LaundryIncompatibilityEdge,
  LaundryPlan,
  TwinState,
  WashMethod,
} from "./types";

function colourFamily(garment: Garment): LaundryColourFamily {
  const colour = garment.colour.toLowerCase();
  if (["cream", "ivory", "white", "beige", "pale", "light"].some((word) => colour.includes(word))) {
    return "light";
  }
  if (["black", "indigo", "navy", "chocolate", "deep", "charcoal"].some((word) => colour.includes(word))) {
    return "dark";
  }
  if (["terracotta", "red", "rose", "orange", "purple", "bright"].some((word) => colour.includes(word))) {
    return "vivid";
  }
  return "neutral";
}

function careHoldout(garment: Garment): LaundryHoldout | null {
  const fields = Object.values(garment.careProfile);
  if (fields.some((field) => field.reviewStatus === "needs-review")) {
    return {
      garmentId: garment.id,
      reason: "care-needs-review",
      detail: "Review the care-label evidence before Yange assigns this piece to a load.",
    };
  }
  if (garment.careProfile.wash.value === "unknown") {
    return { garmentId: garment.id, reason: "wash-unknown", detail: "Wash method is unknown." };
  }
  if (garment.careProfile.wash.value === "dry-clean") {
    return {
      garmentId: garment.id,
      reason: "professional-care",
      detail: "Keep this piece out of home wash loads and use professional care.",
    };
  }
  if (garment.careProfile.dry.value === "unknown") {
    return { garmentId: garment.id, reason: "drying-unknown", detail: "Drying method is unknown." };
  }
  if (garment.careProfile.bleach.value === "unknown") {
    return { garmentId: garment.id, reason: "bleach-unknown", detail: "Bleach instruction is unknown." };
  }
  return null;
}

function noteText(garment: Garment): string {
  return garment.careProfile.notes.value.join(" ").toLowerCase();
}

function rulesBetween(left: Garment, right: Garment): LaundryConflictRule[] {
  const rules = new Set<LaundryConflictRule>();
  if (left.careProfile.wash.value !== right.careProfile.wash.value) rules.add("wash-method");
  const leftFamily = colourFamily(left);
  const rightFamily = colourFamily(right);
  const lightDarkConflict =
    (leftFamily === "light" && ["dark", "vivid"].includes(rightFamily)) ||
    (rightFamily === "light" && ["dark", "vivid"].includes(leftFamily));
  if (lightDarkConflict) rules.add("colour-family");
  const leftNotes = noteText(left);
  const rightNotes = noteText(right);
  if ([leftNotes, rightNotes].some((notes) => /wash separately|colour may transfer|color may transfer/.test(notes))) {
    rules.add("wash-separately");
  }
  if (
    leftFamily !== rightFamily &&
    [leftNotes, rightNotes].some((notes) => /similar (dark )?(colours|colors)|like (colours|colors)/.test(notes))
  ) {
    rules.add("similar-colours");
  }
  return [...rules].sort();
}

function edgeDetail(rules: LaundryConflictRule[]): string {
  const labels: Record<LaundryConflictRule, string> = {
    "wash-method": "different wash methods",
    "colour-family": "light and dark/vivid colours",
    "wash-separately": "a confirmed separate-wash warning",
    "similar-colours": "a confirmed similar-colours instruction",
  };
  return rules.map((rule) => labels[rule]).join(" · ");
}

function colourGraph(
  nodes: Garment[],
  edges: LaundryIncompatibilityEdge[],
): Map<string, number> {
  const neighbours = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    neighbours.get(edge.leftGarmentId)?.add(edge.rightGarmentId);
    neighbours.get(edge.rightGarmentId)?.add(edge.leftGarmentId);
  }
  const assignments = new Map<string, number>();
  while (assignments.size < nodes.length) {
    const remaining = nodes.filter((node) => !assignments.has(node.id));
    remaining.sort((left, right) => {
      const saturation = (id: string) =>
        new Set(
          [...(neighbours.get(id) ?? [])]
            .map((neighbour) => assignments.get(neighbour))
            .filter((value): value is number => value !== undefined),
        ).size;
      return (
        saturation(right.id) - saturation(left.id) ||
        (neighbours.get(right.id)?.size ?? 0) - (neighbours.get(left.id)?.size ?? 0) ||
        left.id.localeCompare(right.id)
      );
    });
    const node = remaining[0];
    const used = new Set(
      [...(neighbours.get(node.id) ?? [])]
        .map((neighbour) => assignments.get(neighbour))
        .filter((value): value is number => value !== undefined),
    );
    let colour = 0;
    while (used.has(colour)) colour += 1;
    assignments.set(node.id, colour);
  }
  return assignments;
}

function strictestBleach(garments: Garment[]): Exclude<BleachMethod, "unknown"> {
  const methods = garments.map((garment) => garment.careProfile.bleach.value);
  if (methods.includes("do-not-bleach")) return "do-not-bleach";
  if (methods.includes("non-chlorine-only")) return "non-chlorine-only";
  return "allowed";
}

function washInstruction(method: Exclude<WashMethod, "unknown" | "dry-clean">): string {
  const instructions: Record<typeof method, string> = {
    "machine-cold": "Machine wash cold on a gentle cycle.",
    "machine-warm": "Machine wash warm using the labelled cycle.",
    "hand-wash": "Hand wash gently without prolonged soaking.",
  };
  return instructions[method];
}

function dryInstruction(method: Exclude<DryMethod, "unknown">): string {
  const instructions: Record<typeof method, string> = {
    "line-dry": "Line dry.",
    "line-dry-shade": "Line dry in shade.",
    "flat-dry": "Reshape and dry flat.",
    "tumble-low": "Tumble dry on low heat.",
  };
  return instructions[method];
}

function stableClusterId(ids: string[]): string {
  let hash = 0;
  for (const character of ids.join("|")) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `load-${hash.toString(36)}`;
}

function buildCluster(garments: Garment[]): LaundryCluster {
  const sorted = [...garments].sort((left, right) => left.id.localeCompare(right.id));
  const washMethod = sorted[0].careProfile.wash.value as Exclude<
    WashMethod,
    "unknown" | "dry-clean"
  >;
  const routeMap = new Map<Exclude<DryMethod, "unknown">, string[]>();
  for (const garment of sorted) {
    const method = garment.careProfile.dry.value as Exclude<DryMethod, "unknown">;
    routeMap.set(method, [...(routeMap.get(method) ?? []), garment.id]);
  }
  const familyCounts = new Map<LaundryColourFamily, number>();
  for (const garment of sorted) {
    const family = colourFamily(garment);
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  const family = [...familyCounts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0][0];
  const bleachMethod = strictestBleach(sorted);
  return {
    id: stableClusterId(sorted.map((garment) => garment.id)),
    washMethod,
    bleachMethod,
    colourFamily: family,
    garmentIds: sorted.map((garment) => garment.id),
    dryingRoutes: [...routeMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([method, garmentIds]) => ({ method, garmentIds, instruction: dryInstruction(method) })),
    instruction: `${washInstruction(washMethod)} ${
      bleachMethod === "do-not-bleach"
        ? "Do not bleach."
        : bleachMethod === "non-chlorine-only"
          ? "Use only non-chlorine bleach if needed."
          : "Bleach is label-permitted, but is not required."
    }`,
    safetyBasis: [
      `exact-wash:${washMethod}`,
      `colour-family:${family}`,
      `strictest-bleach:${bleachMethod}`,
      "all-care-evidence:user-confirmed",
    ],
  };
}

export function createLaundryPlan(state: TwinState): LaundryPlan {
  const laundry = Object.values(state.garments)
    .filter((garment) => garment.state === "laundry")
    .sort((left, right) => left.id.localeCompare(right.id));
  const holdouts: LaundryHoldout[] = [];
  const eligible: Garment[] = [];
  for (const garment of laundry) {
    const holdout = careHoldout(garment);
    if (holdout) holdouts.push(holdout);
    else eligible.push(garment);
  }
  const incompatibilityEdges: LaundryIncompatibilityEdge[] = [];
  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const left = eligible[leftIndex];
      const right = eligible[rightIndex];
      const rules = rulesBetween(left, right);
      if (!rules.length) continue;
      incompatibilityEdges.push({
        leftGarmentId: left.id,
        rightGarmentId: right.id,
        rules,
        detail: edgeDetail(rules),
      });
    }
  }
  const assignments = colourGraph(eligible, incompatibilityEdges);
  const groups = new Map<number, Garment[]>();
  for (const garment of eligible) {
    const group = assignments.get(garment.id) ?? 0;
    groups.set(group, [...(groups.get(group) ?? []), garment]);
  }
  const clusters = [...groups.values()]
    .map(buildCluster)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    engineVersion: "laundry-graph-v1",
    inputGarmentIds: laundry.map((garment) => garment.id),
    clusters,
    holdouts,
    incompatibilityEdges,
  };
}
