import type {
  AgentNotification,
  ForecastPeriod,
  SevenDayForecast,
} from "@yange/domain";

export interface ForecastProvider {
  sevenDay(): Promise<SevenDayForecast>;
}

export interface ForecastValidationOptions {
  now?: () => Date;
  maximumAgeHours?: number;
}

function parsedDate(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid ISO date.`);
  return parsed;
}

function validatePeriod(period: ForecastPeriod): void {
  if (!period.id.trim()) throw new Error("Forecast period ID is required.");
  const startsAt = parsedDate(period.startsAt, "Forecast period start");
  const endsAt = parsedDate(period.endsAt, "Forecast period end");
  if (endsAt <= startsAt) throw new Error("Forecast period must end after it starts.");
  if (!Number.isFinite(period.temperatureC) || period.temperatureC < -50 || period.temperatureC > 60) {
    throw new Error("Forecast temperature must be between -50°C and 60°C.");
  }
  for (const [label, value] of [
    ["Precipitation probability", period.precipitationProbability],
    ["Humidity", period.humidityPercent],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`${label} must be between 0 and 100 percent.`);
    }
  }
  if (!Number.isFinite(period.windKph) || period.windKph < 0 || period.windKph > 250) {
    throw new Error("Forecast wind must be between 0 and 250 km/h.");
  }
}

export function validateSevenDayForecast(
  forecast: SevenDayForecast,
  options: ForecastValidationOptions = {},
): SevenDayForecast {
  if (forecast.version !== 1) throw new Error("Forecast contract version is unsupported.");
  if (!forecast.source.trim()) throw new Error("Forecast source is required.");
  if (!forecast.location.trim()) throw new Error("Forecast location is required.");
  if (!forecast.timeZone.trim()) throw new Error("Forecast time zone is required.");
  const issuedAt = parsedDate(forecast.issuedAt, "Forecast issue time");
  const now = (options.now ?? (() => new Date()))().getTime();
  if (issuedAt > now + 5 * 60_000) throw new Error("Forecast issue time cannot be in the future.");
  if (now - issuedAt > (options.maximumAgeHours ?? 12) * 3_600_000) {
    throw new Error("Forecast is stale; refresh it before running WearCast.");
  }
  if (!forecast.periods.length) throw new Error("Forecast periods are required.");
  const ids = new Set<string>();
  let previousEnd = -Infinity;
  for (const period of forecast.periods) {
    validatePeriod(period);
    if (ids.has(period.id)) throw new Error("Forecast period IDs must be unique.");
    ids.add(period.id);
    const startsAt = parsedDate(period.startsAt, "Forecast period start");
    if (startsAt < previousEnd) throw new Error("Forecast periods must be ordered and non-overlapping.");
    previousEnd = parsedDate(period.endsAt, "Forecast period end");
  }
  const dates = new Set(forecast.periods.map((period) => period.startsAt.slice(0, 10)));
  if (dates.size < 7) throw new Error("Forecast must cover at least seven calendar days.");
  return structuredClone(forecast);
}

export class ManualForecastAdapter implements ForecastProvider {
  constructor(
    private readonly forecast: SevenDayForecast,
    private readonly options: ForecastValidationOptions = {},
  ) {}

  async sevenDay(): Promise<SevenDayForecast> {
    return validateSevenDayForecast(this.forecast, this.options);
  }
}

export function createKampalaDemoForecast(): SevenDayForecast {
  return {
    version: 1,
    source: "manual-kampala-forecast-v1",
    location: "Kampala",
    timeZone: "Africa/Kampala",
    issuedAt: "2026-08-14T07:00:00.000Z",
    periods: [
      { id: "aug14-morning", startsAt: "2026-08-14T07:00:00.000Z", endsAt: "2026-08-14T09:00:00.000Z", temperatureC: 23, precipitationProbability: 74, humidityPercent: 86, windKph: 10, condition: "showers", daylight: true },
      { id: "aug14-drying", startsAt: "2026-08-14T09:30:00.000Z", endsAt: "2026-08-14T13:00:00.000Z", temperatureC: 26, precipitationProbability: 25, humidityPercent: 64, windKph: 13, condition: "cloudy", daylight: true },
      { id: "aug14-evening", startsAt: "2026-08-14T13:30:00.000Z", endsAt: "2026-08-14T17:30:00.000Z", temperatureC: 22, precipitationProbability: 72, humidityPercent: 88, windKph: 17, condition: "rain", daylight: false },
      { id: "aug15-midday", startsAt: "2026-08-15T08:00:00.000Z", endsAt: "2026-08-15T13:00:00.000Z", temperatureC: 27, precipitationProbability: 20, humidityPercent: 59, windKph: 11, condition: "clear", daylight: true },
      { id: "aug16-midday", startsAt: "2026-08-16T08:00:00.000Z", endsAt: "2026-08-16T13:00:00.000Z", temperatureC: 25, precipitationProbability: 48, humidityPercent: 73, windKph: 9, condition: "showers", daylight: true },
      { id: "aug17-midday", startsAt: "2026-08-17T08:00:00.000Z", endsAt: "2026-08-17T13:00:00.000Z", temperatureC: 26, precipitationProbability: 18, humidityPercent: 57, windKph: 15, condition: "clear", daylight: true },
      { id: "aug18-midday", startsAt: "2026-08-18T08:00:00.000Z", endsAt: "2026-08-18T13:00:00.000Z", temperatureC: 24, precipitationProbability: 36, humidityPercent: 70, windKph: 7, condition: "cloudy", daylight: true },
      { id: "aug19-midday", startsAt: "2026-08-19T08:00:00.000Z", endsAt: "2026-08-19T13:00:00.000Z", temperatureC: 25, precipitationProbability: 68, humidityPercent: 83, windKph: 18, condition: "rain", daylight: true },
      { id: "aug20-midday", startsAt: "2026-08-20T08:00:00.000Z", endsAt: "2026-08-20T13:00:00.000Z", temperatureC: 27, precipitationProbability: 22, humidityPercent: 61, windKph: 12, condition: "clear", daylight: true },
    ],
  };
}

export interface NotificationDeliveryResult {
  notificationId: string;
  deliveredAt: string;
  deduplicated: boolean;
  adapter: string;
}

export interface NotificationGateway {
  deliver(notification: AgentNotification, idempotencyKey: string): Promise<NotificationDeliveryResult>;
}

/**
 * Production gateway for Yange's durable in-app inbox. The workflow writes the
 * notification to the user's event ledger before this acknowledgement is
 * recorded. Connected browsers then surface unseen inbox items through the
 * service worker, so delivery remains useful even when OS notifications are
 * disabled.
 */
export class DurableInboxNotificationGateway implements NotificationGateway {
  readonly adapterName = "durable-inbox-service-worker-v1";
  private readonly deliveries = new Map<string, NotificationDeliveryResult>();

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async deliver(
    notification: AgentNotification,
    idempotencyKey: string,
  ): Promise<NotificationDeliveryResult> {
    const existing = this.deliveries.get(idempotencyKey);
    if (existing) return { ...existing, deduplicated: true };
    const result = {
      notificationId: notification.id,
      deliveredAt: this.now(),
      deduplicated: false,
      adapter: this.adapterName,
    };
    this.deliveries.set(idempotencyKey, result);
    return result;
  }
}

export class FakeNotificationGateway implements NotificationGateway {
  readonly adapterName = "fake-in-app-notification-v1";
  private readonly deliveries = new Map<string, NotificationDeliveryResult>();
  private failNextDelivery = false;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  failNext(): void {
    this.failNextDelivery = true;
  }

  reset(): void {
    this.deliveries.clear();
    this.failNextDelivery = false;
  }

  deliveryCount(): number {
    return this.deliveries.size;
  }

  async deliver(
    notification: AgentNotification,
    idempotencyKey: string,
  ): Promise<NotificationDeliveryResult> {
    const existing = this.deliveries.get(idempotencyKey);
    if (existing) return { ...existing, deduplicated: true };
    if (this.failNextDelivery) {
      this.failNextDelivery = false;
      throw new Error("The notification gateway was temporarily unavailable.");
    }
    const result = {
      notificationId: notification.id,
      deliveredAt: this.now(),
      deduplicated: false,
      adapter: this.adapterName,
    };
    this.deliveries.set(idempotencyKey, result);
    return result;
  }
}
