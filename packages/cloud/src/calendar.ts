import { GoogleAuth } from "google-auth-library";
import { validateCalendarSnapshot, type CalendarContextProvider } from "@yange/contracts";
import type {
  CalendarSnapshot,
  DressCode,
  PlanningOccasion,
} from "@yange/domain";

interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
}

interface GoogleCalendarResponse {
  items?: GoogleCalendarEvent[];
}

export interface AccessTokenProvider {
  accessToken(): Promise<string>;
}

export class GoogleApplicationDefaultTokenProvider implements AccessTokenProvider {
  constructor(private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  })) {}

  async accessToken(): Promise<string> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("Google Calendar access token is unavailable.");
    return token;
  }
}

function classify(text: string): { occasion: PlanningOccasion; dressCode: DressCode } {
  const normalized = text.toLowerCase();
  if (/wedding|gala|ceremony|black tie|formal/.test(normalized)) {
    return { occasion: "formal", dressCode: "formal" };
  }
  if (/dinner|date|restaurant|rooftop/.test(normalized)) {
    return { occasion: "dinner", dressCode: "polished" };
  }
  if (/flight|airport|travel|trip|safari/.test(normalized)) {
    return { occasion: "travel", dressCode: "relaxed" };
  }
  if (/studio|work|meeting|office|presentation/.test(normalized)) {
    return { occasion: "creative-work", dressCode: "smart-casual" };
  }
  return { occasion: "casual", dressCode: "relaxed" };
}

export class GoogleCalendarAdapter implements CalendarContextProvider {
  constructor(
    private readonly options: {
      calendarId: string;
      tokenProvider: AccessTokenProvider;
      now?: () => Date;
    },
  ) {}

  async upcoming(): Promise<CalendarSnapshot> {
    const token = await this.options.tokenProvider.accessToken();
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.options.calendarId)}/events`,
    );
    url.searchParams.set("timeMin", (this.options.now ?? (() => new Date()))().toISOString());
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Calendar request failed with ${response.status}.`);
    const body = await response.json() as GoogleCalendarResponse;
    const event = body.items?.[0];
    const startsAt = event?.start?.dateTime ?? event?.start?.date;
    if (!event?.id || !event.summary || !startsAt) {
      throw new Error("Google Calendar has no upcoming event with a usable start time.");
    }
    const classification = classify(`${event.summary} ${event.description ?? ""}`);
    return validateCalendarSnapshot({
      source: "google-calendar-v3",
      eventId: event.id,
      title: event.summary,
      startsAt,
      occasion: classification.occasion,
      dressCode: classification.dressCode,
      notes: (event.description ?? "Imported from Google Calendar.").slice(0, 240),
    });
  }
}
