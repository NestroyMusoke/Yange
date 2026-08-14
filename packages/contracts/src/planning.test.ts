import { describe, expect, it } from "vitest";
import type { CalendarSnapshot, WeatherSnapshot } from "@yange/domain";
import { createSeedState, generateOutfitCandidates } from "@yange/domain";
import {
  FakeGeminiExplanationAdapter,
  ManualCalendarAdapter,
  ManualWeatherAdapter,
  OUTFIT_EXPLANATION_CONTRACT_VERSION,
  parseOutfitExplanation,
  planningContextFrom,
} from "./index";

const now = new Date("2026-08-14T09:00:00.000Z");
const weather: WeatherSnapshot = {
  source: "manual-weather-v1",
  location: "Kampala",
  observedAt: "2026-08-14T08:30:00.000Z",
  temperatureC: 25,
  precipitationProbability: 45,
  condition: "showers",
};
const calendar: CalendarSnapshot = {
  source: "manual-calendar-v1",
  eventId: "event-1",
  title: "Rooftop dinner",
  startsAt: "2026-08-14T16:00:00.000Z",
  occasion: "dinner",
  dressCode: "polished",
  notes: "Covered terrace",
};

describe("Phase 3 planning contracts", () => {
  it("builds a validated planning context through replaceable ports", async () => {
    const context = await planningContextFrom(
      new ManualWeatherAdapter(weather, { now: () => now }),
      new ManualCalendarAdapter(calendar),
      null,
    );
    expect(context.weather.location).toBe("Kampala");
    expect(context.calendar.occasion).toBe("dinner");
  });

  it("rejects stale weather and impossible precipitation", async () => {
    const stale = { ...weather, observedAt: "2026-08-12T08:30:00.000Z" };
    await expect(new ManualWeatherAdapter(stale, { now: () => now }).current()).rejects.toThrow("stale");
    await expect(
      new ManualWeatherAdapter({ ...weather, precipitationProbability: 140 }, { now: () => now }).current(),
    ).rejects.toThrow("between 0 and 100");
  });

  it("returns explanation-only output and recovers after one failure", async () => {
    const context = await planningContextFrom(
      new ManualWeatherAdapter(weather, { now: () => now }),
      new ManualCalendarAdapter(calendar),
      null,
    );
    const candidate = generateOutfitCandidates(createSeedState(), context, 1)[0];
    const adapter = new FakeGeminiExplanationAdapter({ now: () => now.toISOString() });
    adapter.failNext();
    await expect(
      adapter.explain({
        contractVersion: OUTFIT_EXPLANATION_CONTRACT_VERSION,
        requestId: "explain-1",
        candidate,
      }),
    ).rejects.toThrow("temporarily unavailable");
    const response = await adapter.explain({
      contractVersion: OUTFIT_EXPLANATION_CONTRACT_VERSION,
      requestId: "explain-2",
      candidate,
    });
    expect(response.citedFactorKeys.length).toBeGreaterThan(0);
    expect(response).not.toHaveProperty("garmentIds");
  });

  it("rejects an explanation that tries to smuggle in a decision", () => {
    expect(() =>
      parseOutfitExplanation(
        {
          contractVersion: "1.0",
          requestId: "unsafe",
          adapter: "unsafe",
          generatedAt: now.toISOString(),
          headline: "Unsafe",
          rationale: "Unsafe",
          tradeoffs: [],
          citedFactorKeys: ["context"],
          garmentIds: ["cream-blouse"],
        },
        ["context"],
      ),
    ).toThrow("cannot contain decisions");

    expect(() =>
      parseOutfitExplanation(
        {
          contractVersion: "1.0",
          requestId: "unsafe-command",
          adapter: "unsafe",
          generatedAt: now.toISOString(),
          headline: "Unsafe",
          rationale: "Unsafe",
          tradeoffs: [],
          citedFactorKeys: ["context"],
          commands: [{ type: "reserve-outfit" }],
        },
        ["context"],
      ),
    ).toThrow("unrecognized field");
  });
});
