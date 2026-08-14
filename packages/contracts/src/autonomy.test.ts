import { describe, expect, it } from "vitest";
import { createSeedState, type AgentNotification } from "@yange/domain";
import {
  createKampalaDemoForecast,
  FakeNotificationGateway,
  ManualForecastAdapter,
  validateSevenDayForecast,
} from "./index";

const now = new Date("2026-08-14T07:30:00.000Z");

describe("Phase 4 autonomy contracts", () => {
  it("validates a seven-day forecast through a replaceable provider", async () => {
    const adapter = new ManualForecastAdapter(createKampalaDemoForecast(), { now: () => now });
    const forecast = await adapter.sevenDay();
    expect(new Set(forecast.periods.map((period) => period.startsAt.slice(0, 10))).size).toBe(7);
    expect(forecast.source).toBe("manual-kampala-forecast-v1");
  });

  it("rejects stale, overlapping, and short forecasts", () => {
    const base = createKampalaDemoForecast();
    expect(() => validateSevenDayForecast({ ...base, issuedAt: "2026-08-12T00:00:00.000Z" }, { now: () => now })).toThrow("stale");
    expect(() => validateSevenDayForecast({ ...base, periods: base.periods.slice(0, 3) }, { now: () => now })).toThrow("seven calendar days");
    const overlapping = structuredClone(base);
    overlapping.periods[1].startsAt = overlapping.periods[0].startsAt;
    expect(() => validateSevenDayForecast(overlapping, { now: () => now })).toThrow("non-overlapping");
  });

  it("fails once and deduplicates delivery by idempotency key", async () => {
    const gateway = new FakeNotificationGateway(() => now.toISOString());
    const seed = createSeedState();
    const notification: AgentNotification = {
      id: "notification-1",
      runId: "run-1",
      kind: "laundry-risk",
      severity: "warning",
      title: "Laundry risk",
      body: "A test notification.",
      relatedOutfitId: null,
      relatedGarmentIds: Object.keys(seed.garments).slice(0, 1),
      queuedAt: now.toISOString(),
      deliveredAt: null,
      deliveryStatus: "queued",
    };
    gateway.failNext();
    await expect(gateway.deliver(notification, "stable-key")).rejects.toThrow("temporarily unavailable");
    const first = await gateway.deliver(notification, "stable-key");
    const duplicate = await gateway.deliver(notification, "stable-key");
    expect(first.deduplicated).toBe(false);
    expect(duplicate.deduplicated).toBe(true);
    expect(gateway.deliveryCount()).toBe(1);
  });
});
