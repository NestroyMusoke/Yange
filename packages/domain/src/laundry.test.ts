import { describe, expect, it } from "vitest";
import {
  createLaundryPlan,
  createSeedState,
  queueGarmentsForLaundry,
  replayEvents,
} from "./index";

const occurredAt = "2026-08-14T10:00:00.000Z";

function stagedLaundry() {
  const state = createSeedState();
  const events = queueGarmentsForLaundry(state, [], {
    garmentIds: ["cream-blouse", "chocolate-trousers", "indigo-shirt", "ivory-knit"],
    operationId: "laundry-1",
    occurredAt,
  });
  return replayEvents(state, events);
}

describe("material-safe laundry graph", () => {
  it("creates deterministic clusters with no internal incompatibility edge", () => {
    const state = stagedLaundry();
    const first = createLaundryPlan(state);
    const second = createLaundryPlan(structuredClone(state));
    expect(first).toEqual(second);
    expect(first.clusters.length).toBeGreaterThan(1);
    expect(first.clusters.some((cluster) =>
      cluster.garmentIds.includes("chocolate-trousers") && cluster.garmentIds.includes("indigo-shirt"),
    )).toBe(true);

    const edgePairs = new Set(
      first.incompatibilityEdges.map((edge) =>
        [edge.leftGarmentId, edge.rightGarmentId].sort().join("|"),
      ),
    );
    for (const cluster of first.clusters) {
      for (let left = 0; left < cluster.garmentIds.length; left += 1) {
        for (let right = left + 1; right < cluster.garmentIds.length; right += 1) {
          expect(edgePairs.has([cluster.garmentIds[left], cluster.garmentIds[right]].sort().join("|"))).toBe(false);
        }
      }
    }
  });

  it("separates light and dark garments and different wash methods", () => {
    const plan = createLaundryPlan(stagedLaundry());
    expect(
      plan.incompatibilityEdges.some(
        (edge) => edge.rules.includes("colour-family") && edge.rules.includes("wash-method") === false,
      ),
    ).toBe(true);
    expect(plan.incompatibilityEdges.some((edge) => edge.rules.includes("wash-method"))).toBe(true);
  });

  it("holds unknown and unreviewed care evidence out of every load", () => {
    const state = createSeedState();
    state.garments["black-loafers"].state = "laundry";
    state.garments["cream-blouse"].state = "laundry";
    state.garments["cream-blouse"].careProfile.wash.reviewStatus = "needs-review";
    state.garments["cream-blouse"].careProfile.wash.provenance = "ai-estimated";
    const plan = createLaundryPlan(state);

    expect(plan.holdouts.map((holdout) => holdout.garmentId).sort()).toEqual([
      "black-loafers",
      "cream-blouse",
    ]);
    expect(plan.clusters).toEqual([]);
  });

  it("queues laundry through idempotent garment-state events", () => {
    const state = createSeedState();
    const input = {
      garmentIds: ["indigo-shirt", "terracotta-skirt"],
      operationId: "queue-2",
      occurredAt,
    };
    const events = queueGarmentsForLaundry(state, [], input);
    const projected = replayEvents(state, events);
    expect(projected.garments["indigo-shirt"].state).toBe("laundry");
    expect(queueGarmentsForLaundry(projected, events, input)).toEqual([]);
  });
});
