import { describe, expect, it, vi } from "vitest";
import { QlooTasteAdapter } from "./qloo";
const id = "f0d354aa-ba7e-49d2-8aba-9a8250f5c852";
const item = { entity_id: id, name: "Example film", subtype: "urn:entity:movie" };
function client(body: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  return { adapter: new QlooTasteAdapter("test-secret", fetcher), fetcher };
}
describe("Qloo hackathon adapter", () => {
  it("uses the hackathon host, header auth and real search IDs", async () => {
    const { adapter, fetcher } = client({ success: true, results: [item, { name: "Missing ID" }] });
    expect(await adapter.search("film & music")).toEqual([{ id, name: item.name, type: item.subtype }]);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain("https://hackathon.api.qloo.com/search?");
    expect(new URL(String(url)).searchParams.get("query")).toBe("film & music");
    expect(options?.headers).toMatchObject({ "X-Api-Key": "test-secret" });
    expect(String(url)).not.toContain("test-secret");
  });
  it("grounds places in selected interests and bounds the city without inventing details", async () => {
    const { adapter, fetcher } = client({ success: true, results: { entities: [{ ...item, name: "Example venue", subtype: "urn:entity:place" }] } });
    const result = await adapter.recommend("Kampala", [id]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.pathname).toBe("/v2/insights");
    expect(url.searchParams.get("signal.interests.entities")).toBe(id);
    expect(url.searchParams.get("filter.location.query")).toBe("Kampala");
    expect(url.searchParams.get("filter.location.radius")).toBe("0");
    expect(url.searchParams.get("filter.tags")).toBe("urn:tag:genre:place:restaurant,urn:tag:genre:place:night_club");
    expect(url.searchParams.get("operator.filter.tags")).toBe("union");
    expect(result).toMatchObject({ source: "qloo", city: "Kampala", interestIds: [id], places: [{ id, address: null }] });
  });
  it("keeps genuine empty results empty", async () => {
    expect((await client({ results: { entities: [] } }).adapter.recommend("Kampala", [id])).places).toEqual([]);
  });
  it.each([401, 403, 429, 500])("sanitizes upstream failures (%s)", async (status) => {
    await expect(client({ secret: "upstream-detail" }, status).adapter.search("film")).rejects.toMatchObject({ status: status === 429 ? 429 : 503 });
  });
  it("rejects malformed results", async () => {
    await expect(client({ results: {} }).adapter.search("film")).rejects.toMatchObject({ status: 502 });
    await expect(client({ success: false }).adapter.recommend("Kampala", [id])).rejects.toMatchObject({ status: 502 });
  });
  it("turns network failures into a retryable, sanitized error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret transport details"));
    await expect(new QlooTasteAdapter("key", fetcher).search("film")).rejects.toMatchObject({ status: 503, message: "Taste discovery could not connect. Please try again shortly." });
  });
});
