import type { GoogleAuth } from "google-auth-library";
import { describe, expect, it } from "vitest";
import { GoogleWeatherForecastAdapter } from "./weather";

describe("GoogleWeatherForecastAdapter", () => {
  it("coalesces concurrent requests and reuses a fresh forecast", async () => {
    const now = new Date("2026-08-14T07:00:00.000Z");
    const forecastHours = Array.from({ length: 168 }, (_, index) => {
      const startsAt = new Date(now.getTime() + index * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      return {
        interval: { startTime: startsAt.toISOString(), endTime: endsAt.toISOString() },
        weatherCondition: { type: "PARTLY_CLOUDY" },
        temperature: { degrees: 24 },
        precipitation: { probability: { percent: 20 } },
        relativeHumidity: 65,
        wind: { speed: { kilometersPerHour: 9 } },
        isDaytime: true,
      };
    });
    let requests = 0;
    const auth = {
      async request() {
        requests += 1;
        return { data: { forecastHours, timeZone: { id: "Africa/Kampala" } } };
      },
    } as unknown as GoogleAuth;
    const adapter = new GoogleWeatherForecastAdapter({
      latitude: 0.3476,
      longitude: 32.5825,
      locationLabel: "Kampala",
      now: () => now,
      auth,
    });

    const [first, second] = await Promise.all([adapter.sevenDay(), adapter.sevenDay()]);
    first.periods[0]!.temperatureC = -20;
    const third = await adapter.sevenDay();

    expect(requests).toBe(1);
    expect(second.periods).toHaveLength(168);
    expect(third.periods[0]?.temperatureC).toBe(24);
  });
});
