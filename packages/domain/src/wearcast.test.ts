import { describe, expect, it } from "vitest";
import {
  assessDryingPeriod,
  commitWearCastDecision,
  createSeedState,
  evaluateWearCast,
  markNotificationDelivered,
  queueGarmentsForLaundry,
  replayEvents,
  type SevenDayForecast,
} from "./index";

const generatedAt = "2026-08-14T07:30:00.000Z";

const forecast: SevenDayForecast = {
  version: 1,
  source: "test-forecast-v1",
  location: "Kampala",
  timeZone: "Africa/Kampala",
  issuedAt: "2026-08-14T07:00:00.000Z",
  periods: [
    { id: "unsafe-rain", startsAt: "2026-08-14T07:00:00.000Z", endsAt: "2026-08-14T09:00:00.000Z", temperatureC: 23, precipitationProbability: 80, humidityPercent: 90, windKph: 12, condition: "rain", daylight: true },
    { id: "safe-window", startsAt: "2026-08-14T09:30:00.000Z", endsAt: "2026-08-14T13:00:00.000Z", temperatureC: 27, precipitationProbability: 15, humidityPercent: 58, windKph: 13, condition: "clear", daylight: true },
    ...[15, 16, 17, 18, 19, 20].map((day) => ({ id: `day-${day}`, startsAt: `2026-08-${day}T08:00:00.000Z`, endsAt: `2026-08-${day}T13:00:00.000Z`, temperatureC: 25, precipitationProbability: 25, humidityPercent: 62, windKph: 10, condition: "cloudy" as const, daylight: true })),
  ],
};

function pressureState() {
  const seed = createSeedState();
  const events = queueGarmentsForLaundry(seed, [], {
    garmentIds: ["cream-blouse", "chocolate-trousers", "ivory-knit"],
    operationId: "stage-pressure",
    occurredAt: generatedAt,
  });
  return replayEvents(seed, events);
}

describe("WearCast autonomy policy", () => {
  it("produces deterministic non-destructive branches at the 50% capacity threshold", () => {
    const state = pressureState();
    const before = structuredClone(state);
    const first = evaluateWearCast(state, forecast, generatedAt);
    const second = evaluateWearCast(structuredClone(state), structuredClone(forecast), generatedAt);

    expect(first).toEqual(second);
    expect(state).toEqual(before);
    expect(first.capacity.ratio).toBe(0.5);
    expect(first.capacity.triggered).toBe(true);
    expect(first.risks[0].outfitId).toBe("friday-rooftop");
    expect(first.risks[0].unavailableGarmentIds.sort()).toEqual([
      "chocolate-trousers",
      "cream-blouse",
    ]);
    expect(first.scenarios.doNothing.unresolvedOutfitIds).toContain("friday-rooftop");
    expect(first.scenarios.autopilot.protectedOutfitIds).toContain("friday-rooftop");
    expect(first.fallbackCandidate).not.toBeNull();
  });

  it("never marks a rainy period as an outdoor-safe drying window", () => {
    const unsafe = assessDryingPeriod(forecast.periods[0]);
    const safe = assessDryingPeriod(forecast.periods[1]);
    expect(unsafe.outdoorSafe).toBe(false);
    expect(unsafe.suitability).toBe("unsafe");
    expect(safe.outdoorSafe).toBe(true);
    expect(safe.score).toBeGreaterThan(unsafe.score);
  });

  it("does not fire the capacity policy below one half", () => {
    const seed = createSeedState();
    const events = queueGarmentsForLaundry(seed, [], {
      garmentIds: ["cream-blouse", "ivory-knit"],
      operationId: "below-threshold",
      occurredAt: generatedAt,
    });
    const decision = evaluateWearCast(replayEvents(seed, events), forecast, generatedAt);
    expect(decision.capacity.ratio).toBeCloseTo(1 / 3);
    expect(decision.capacity.triggered).toBe(false);
  });

  it("commits one fallback, reservations, windows, and notifications idempotently", () => {
    const state = pressureState();
    const decision = evaluateWearCast(state, forecast, generatedAt);
    const input = {
      runId: "run-test",
      triggerId: "trigger-test",
      decision,
      operationId: "wearcast:trigger-test:commit",
      occurredAt: "2026-08-14T07:31:00.000Z",
    };
    const events = commitWearCastDecision(state, [], input);
    const projected = replayEvents(state, events);
    const run = projected.autonomy.runs["run-test"];
    expect(run.riskCount).toBeGreaterThan(0);
    expect(Object.values(projected.autonomy.laundryWindows).length).toBeGreaterThan(0);
    expect(Object.values(projected.autonomy.notifications)).toHaveLength(decision.notifications.length);
    expect(run.fallbackOutfitId).not.toBeNull();
    expect(Object.values(projected.autonomy.recoveries)).toHaveLength(1);
    expect(commitWearCastDecision(projected, events, input)).toEqual([]);
  });

  it("records notification delivery once", () => {
    const state = pressureState();
    const decision = evaluateWearCast(state, forecast, generatedAt);
    const committed = commitWearCastDecision(state, [], {
      runId: "run-delivery",
      triggerId: "delivery",
      decision,
      operationId: "wearcast:delivery:commit",
      occurredAt: generatedAt,
    });
    const projected = replayEvents(state, committed);
    const notificationId = decision.notifications[0].id;
    const deliveryInput = { notificationId, operationId: "delivery-once", occurredAt: generatedAt };
    const delivered = markNotificationDelivered(projected, committed, deliveryInput);
    const after = replayEvents(projected, delivered);
    expect(after.autonomy.notifications[notificationId].deliveryStatus).toBe("delivered");
    expect(markNotificationDelivered(after, [...committed, ...delivered], deliveryInput)).toEqual([]);
  });
});
