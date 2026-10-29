import { useState } from "react";
import type { OutingSuggestions, TasteEntity, TastePlace } from "@yange/contracts";
import { searchTaste, suggestOutings } from "../../cloudRuntime";
import "./tasteOutings.css";

export interface SelectedOuting {
  place: TastePlace;
  city: string;
  interests: TasteEntity[];
  fetchedAt: string;
}
interface Props {
  city: string;
  onSelect(outing: SelectedOuting): void;
}
export function TasteOutings({ city, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TasteEntity[]>([]);
  const [interests, setInterests] = useState<TasteEntity[]>([]);
  const [result, setResult] = useState<OutingSuggestions | null>(null);
  const [busy, setBusy] = useState<"search" | "places" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search() {
    setBusy("search"); setError(null); setMatches([]); setSearched(false);
    try { setMatches((await searchTaste(query.trim())).entities); setSearched(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed. Please try again."); }
    finally { setBusy(null); }
  }
  async function discover() {
    setBusy("places"); setError(null); setResult(null);
    try { setResult(await suggestOutings(city, interests.map((item) => item.id))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Discovery failed. Please try again."); }
    finally { setBusy(null); }
  }
  function changeInterests(next: TasteEntity[]) { setInterests(next); setResult(null); setError(null); }

  return <section className="taste-outings" aria-labelledby="taste-title">
    <header><span className="taste-eyebrow">Your taste → your plans → your wardrobe</span>
      <h3 id="taste-title">A day out that feels like you.</h3>
      <p>Choose up to five artists, films, brands or places you love. Qloo finds dining and nightlife spots in {city}; Yange helps you dress from what you own.</p>
    </header>
    <form className="taste-search" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <label><span>Find an interest</span><input type="search" value={query} maxLength={100} placeholder="An artist, film, brand or favourite place" disabled={busy !== null} onChange={(event) => { setQuery(event.target.value); setMatches([]); setSearched(false); }} /></label>
      <button type="submit" disabled={busy !== null || query.trim().length < 2}>{busy === "search" ? "Searching…" : "Search interests"}</button>
    </form>
    {matches.length > 0 && <ul className="taste-matches" aria-label="Matching interests">{matches.map((item) => <li key={item.id}>
      <button type="button" disabled={busy !== null || interests.length >= 5 || interests.some((selected) => selected.id === item.id)} onClick={() => changeInterests([...interests, item])}>
        <strong>{item.name}</strong><small>{item.type.replace("urn:entity:", "").replaceAll("_", " ")}</small><span>{interests.some((selected) => selected.id === item.id) ? "Added" : "Add interest"}</span>
      </button>
    </li>)}</ul>}
    {searched && !matches.length && <p role="status">No interests found. Try another name or spelling.</p>}
    {interests.length > 0 && <div className="taste-selected" aria-label="Your selected interests">{interests.map((item) => <button type="button" key={item.id} disabled={busy !== null} aria-label={`Remove ${item.name}`} onClick={() => changeInterests(interests.filter((selected) => selected.id !== item.id))}>{item.name} ×</button>)}</div>}
    <p className="taste-disclosure">Your search, selected interests and profile city are sent to Qloo. Wardrobe photos and personal measurements are not included.</p>
    <button type="button" className="primary-action" disabled={busy !== null || !interests.length} onClick={() => void discover()}>{busy === "places" ? "Finding places for your taste…" : `Find places in ${city}`}</button>
    {error && <p role="alert" className="taste-error">{error}</p>}
    <div role="status" aria-live="polite">{result && <p>{result.places.length ? `${result.places.length} ${result.places.length === 1 ? "place" : "places"} returned by Qloo, in recommendation order.` : "No places found for these interests in your city. Try different interests. Coverage varies by location."}</p>}</div>
    {result && result.places.length > 0 && <>
      <p className="taste-receipt">Based on {interests.map((item) => item.name).join(" · ")} · {result.city}</p>
      <div className="taste-places">{result.places.map((place) => <article key={place.id}>
        <span className="taste-eyebrow">Qloo recommendation</span><h4>{place.name}</h4>
        <p>{place.address ?? `In ${result.city} · address not supplied`}</p>
        <button type="button" onClick={() => onSelect({ place, city: result.city, interests: [...interests], fetchedAt: result.fetchedAt })}>Choose this outing</button>
      </article>)}</div>
      <p className="taste-disclosure">Taste suggestions are not bookings. Check opening hours, location and dress requirements with the venue.</p>
    </>}
  </section>;
}
