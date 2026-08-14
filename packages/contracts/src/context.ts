import type {
  CalendarSnapshot,
  PlanningContext,
  WeatherSnapshot,
} from "@yange/domain";

export interface WeatherContextProvider {
  current(): Promise<WeatherSnapshot>;
}

export interface CalendarContextProvider {
  upcoming(): Promise<CalendarSnapshot>;
}

export interface ManualContextOptions {
  now?: () => Date;
  maximumWeatherAgeMinutes?: number;
}

function validDate(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid ISO date.`);
  return timestamp;
}

export function validateWeatherSnapshot(
  snapshot: WeatherSnapshot,
  options: ManualContextOptions = {},
): WeatherSnapshot {
  if (!snapshot.location.trim()) throw new Error("Weather location is required.");
  if (!Number.isFinite(snapshot.temperatureC) || snapshot.temperatureC < -50 || snapshot.temperatureC > 60) {
    throw new Error("Temperature must be between -50°C and 60°C.");
  }
  if (
    !Number.isFinite(snapshot.precipitationProbability) ||
    snapshot.precipitationProbability < 0 ||
    snapshot.precipitationProbability > 100
  ) {
    throw new Error("Precipitation probability must be between 0 and 100 percent.");
  }
  const observedAt = validDate(snapshot.observedAt, "Weather observation time");
  const now = (options.now ?? (() => new Date()))().getTime();
  if (observedAt > now + 5 * 60_000) throw new Error("Weather observation cannot be in the future.");
  const maximumAge = (options.maximumWeatherAgeMinutes ?? 12 * 60) * 60_000;
  if (now - observedAt > maximumAge) throw new Error("Weather context is stale; refresh it before planning.");
  return structuredClone(snapshot);
}

export function validateCalendarSnapshot(snapshot: CalendarSnapshot): CalendarSnapshot {
  if (!snapshot.eventId.trim()) throw new Error("Calendar event ID is required.");
  if (!snapshot.title.trim()) throw new Error("Calendar event title is required.");
  validDate(snapshot.startsAt, "Calendar event start");
  if (snapshot.notes.length > 240) throw new Error("Calendar notes must be 240 characters or fewer.");
  return structuredClone(snapshot);
}

export class ManualWeatherAdapter implements WeatherContextProvider {
  constructor(
    private readonly snapshot: WeatherSnapshot,
    private readonly options: ManualContextOptions = {},
  ) {}

  async current(): Promise<WeatherSnapshot> {
    return validateWeatherSnapshot(this.snapshot, this.options);
  }
}

export class ManualCalendarAdapter implements CalendarContextProvider {
  constructor(private readonly snapshot: CalendarSnapshot) {}

  async upcoming(): Promise<CalendarSnapshot> {
    return validateCalendarSnapshot(this.snapshot);
  }
}

export async function planningContextFrom(
  weatherProvider: WeatherContextProvider,
  calendarProvider: CalendarContextProvider,
  inspirationLookId: string | null,
): Promise<PlanningContext> {
  const [weather, calendar] = await Promise.all([
    weatherProvider.current(),
    calendarProvider.upcoming(),
  ]);
  return {
    version: 1,
    weather,
    calendar,
    inspirationLookId,
  };
}
