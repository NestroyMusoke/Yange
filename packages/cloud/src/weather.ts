import { GoogleAuth } from "google-auth-library";
import {
  validateSevenDayForecast,
  validateWeatherSnapshot,
  type ForecastProvider,
  type WeatherContextProvider,
} from "@yange/contracts";
import type {
  ForecastPeriod,
  SevenDayForecast,
  WeatherCondition,
  WeatherSnapshot,
} from "@yange/domain";

interface GoogleWeatherHour {
  interval?: { startTime?: string; endTime?: string };
  weatherCondition?: { type?: string };
  temperature?: { degrees?: number };
  precipitation?: { probability?: { percent?: number } };
  relativeHumidity?: number;
  wind?: { speed?: { value?: number; kilometersPerHour?: number } };
  isDaytime?: boolean;
}

interface GoogleWeatherResponse {
  forecastHours?: GoogleWeatherHour[];
  timeZone?: { id?: string };
  nextPageToken?: string;
}

function conditionFrom(value: string | undefined): WeatherCondition {
  const normalized = value?.toUpperCase() ?? "";
  if (normalized.includes("WIND")) return "windy";
  if (normalized.includes("RAIN") && !normalized.includes("SHOW")) return "rain";
  if (normalized.includes("SHOWER") || normalized.includes("DRIZZLE")) return "showers";
  if (normalized.includes("CLOUD") || normalized.includes("OVERCAST") || normalized.includes("FOG")) {
    return "cloudy";
  }
  return "clear";
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toForecastPeriod(hour: GoogleWeatherHour, index: number): ForecastPeriod {
  const startsAt = hour.interval?.startTime;
  const endsAt = hour.interval?.endTime;
  if (!startsAt || !endsAt) throw new Error("Google Weather returned an hour without an interval.");
  return {
    id: `google-weather-${startsAt}-${index}`,
    startsAt,
    endsAt,
    temperatureC: finiteOr(hour.temperature?.degrees, 22),
    precipitationProbability: finiteOr(hour.precipitation?.probability?.percent, 0),
    humidityPercent: finiteOr(hour.relativeHumidity, 65),
    windKph: finiteOr(hour.wind?.speed?.kilometersPerHour ?? hour.wind?.speed?.value, 0),
    condition: conditionFrom(hour.weatherCondition?.type),
    daylight: hour.isDaytime ?? true,
  };
}

export class GoogleWeatherForecastAdapter implements ForecastProvider, WeatherContextProvider {
  private cache: { forecast: SevenDayForecast; expiresAt: number } | null = null;
  private inFlight: Promise<SevenDayForecast> | null = null;

  constructor(
    private readonly options: {
      latitude: number;
      longitude: number;
      locationLabel: string;
      now?: () => Date;
      auth?: GoogleAuth;
    },
  ) {}

  async sevenDay(): Promise<SevenDayForecast> {
    const currentTime = (this.options.now ?? (() => new Date()))().getTime();
    if (this.cache && currentTime < this.cache.expiresAt) {
      return structuredClone(this.cache.forecast);
    }
    if (this.inFlight) return structuredClone(await this.inFlight);

    this.inFlight = this.fetchSevenDay();
    try {
      const forecast = await this.inFlight;
      this.cache = {
        forecast: structuredClone(forecast),
        // Google's forecast refresh cadence is roughly 30 minutes. A 25-minute
        // process-local cache avoids request stampedes without serving stale plans.
        expiresAt: currentTime + 25 * 60 * 1_000,
      };
      return structuredClone(forecast);
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchSevenDay(): Promise<SevenDayForecast> {
    const auth = this.options.auth ?? new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const periods: ForecastPeriod[] = [];
    let pageToken: string | undefined;
    let timeZone = "UTC";
    do {
      const response = await auth.request<GoogleWeatherResponse>({
        url: "https://weather.googleapis.com/v1/forecast/hours:lookup",
        method: "GET",
        params: {
          "location.latitude": this.options.latitude,
          "location.longitude": this.options.longitude,
          hours: 168,
          pageSize: 24,
          unitsSystem: "METRIC",
          ...(pageToken ? { pageToken } : {}),
        },
      });
      const hours = response.data.forecastHours ?? [];
      periods.push(...hours.map((hour, index) => toForecastPeriod(hour, periods.length + index)));
      timeZone = response.data.timeZone?.id ?? timeZone;
      pageToken = response.data.nextPageToken;
    } while (pageToken && periods.length < 168);

    const forecast: SevenDayForecast = {
      version: 1,
      source: "google-weather-api-v1",
      location: this.options.locationLabel,
      timeZone,
      issuedAt: (this.options.now ?? (() => new Date()))().toISOString(),
      periods,
    };
    return validateSevenDayForecast(forecast, { now: this.options.now });
  }

  async current(): Promise<WeatherSnapshot> {
    const forecast = await this.sevenDay();
    const period = forecast.periods[0];
    if (!period) throw new Error("Google Weather returned no current forecast period.");
    return validateWeatherSnapshot({
      source: forecast.source,
      location: forecast.location,
      observedAt: forecast.issuedAt,
      temperatureC: period.temperatureC,
      precipitationProbability: period.precipitationProbability,
      condition: period.condition,
    }, { now: this.options.now });
  }
}
