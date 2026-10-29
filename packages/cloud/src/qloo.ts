import { QLOO_ENTITY_ID, type TasteEntity, type TastePlace, type TasteProvider, type OutingSuggestions } from "@yange/contracts";

export class QlooError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function entity(value: unknown): TasteEntity | null {
  const item = object(value);
  const types = Array.isArray(item.types) ? item.types : [];
  if (typeof item.entity_id !== "string" || !QLOO_ENTITY_ID.test(item.entity_id) || typeof item.name !== "string" || !item.name.trim()) return null;
  return { id: item.entity_id, name: item.name.slice(0, 160), type: typeof item.subtype === "string" ? item.subtype : typeof types[0] === "string" ? types[0] : "unknown" };
}

export class QlooTasteAdapter implements TasteProvider {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  private async get(path: string, parameters: Record<string, string>): Promise<Record<string, unknown>> {
    const url = new URL(path, "https://hackathon.api.qloo.com");
    url.search = new URLSearchParams(parameters).toString();
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { "X-Api-Key": this.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
    } catch {
      throw new QlooError(503, "Taste discovery could not connect. Please try again shortly.");
    }
    if (!response.ok) {
      if (response.status === 429) throw new QlooError(429, "Taste discovery is busy. Wait a minute and try again.");
      if (response.status === 400) throw new QlooError(422, "Qloo could not resolve these interests or this city. Try different interests or check your profile city.");
      if (response.status === 401 || response.status === 403) throw new QlooError(503, "Taste discovery needs a valid Qloo hackathon key on the server.");
      throw new QlooError(503, "Taste discovery is temporarily unavailable. Please try again.");
    }
    try {
      const body = object(await response.json());
      if (body.success === false) throw new Error();
      return body;
    } catch {
      throw new QlooError(502, "Qloo returned an unreadable result. Please try again.");
    }
  }

  async search(query: string): Promise<TasteEntity[]> {
    const body = await this.get("/search", { query, types: "urn:entity:artist,urn:entity:movie,urn:entity:brand,urn:entity:place", take: "8" });
    if (!Array.isArray(body.results)) throw new QlooError(502, "Qloo returned an unexpected search result.");
    return body.results.map(entity).filter((item): item is TasteEntity => item !== null).slice(0, 8);
  }

  async recommend(city: string, interestIds: string[]): Promise<OutingSuggestions> {
    const body = await this.get("/v2/insights", {
      "filter.type": "urn:entity:place",
      "filter.location.query": city,
      "filter.location.radius": "0",
      "filter.tags": "urn:tag:genre:place:restaurant,urn:tag:genre:place:night_club",
      "operator.filter.tags": "union",
      "signal.interests.entities": interestIds.join(","),
      take: "6",
    });
    const items = object(body.results).entities;
    if (!Array.isArray(items)) throw new QlooError(502, "Qloo returned an unexpected recommendation result.");
    const places = items.flatMap((item): TastePlace[] => {
      const parsed = entity(item);
      if (!parsed) return [];
      const properties = object(object(item).properties);
      return [{ ...parsed, type: "urn:entity:place", address: typeof properties.address === "string" ? properties.address.slice(0, 240) : null }];
    }).slice(0, 6);
    return { source: "qloo", city, interestIds: [...interestIds], fetchedAt: new Date().toISOString(), places };
  }
}
