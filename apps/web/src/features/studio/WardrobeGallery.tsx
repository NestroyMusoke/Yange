import { useState } from "react";
import type { Garment, GarmentCategory, GarmentState, LookDna } from "@yange/domain";
import { filterGarments } from "./wardrobeFilters";
import "./wardrobeFilters.css";
import { EvidenceBadge } from "./EvidenceBadge";
import { GarmentEditor } from "./GarmentEditor";
import { useMediaUrl } from "./useCaptureQueue";
import { useGarmentPhoto } from "./useGarmentPhoto";

function GarmentThumbnail({ garment, onEdit }: { garment: Garment; onEdit(): void }) {
  const photo = useGarmentPhoto(garment.imageAssetId);
  const [showOriginal, setShowOriginal] = useState(false);
  const url = showOriginal ? photo.originalUrl : photo.url;
  return (
    <article className="studio-garment-card">
      <div className={`studio-garment-image ${photo.isCutout && !showOriginal ? "is-cutout" : ""}`}>
        {url ? <img src={url} alt={`${garment.name} wardrobe photo`} loading="lazy" decoding="async" /> : <span>{garment.category}</span>}
        <em>{garment.state}</em>
        {photo.isCutout && (
          <button
            type="button"
            className="studio-photo-mode"
            aria-pressed={showOriginal}
            onClick={() => setShowOriginal((current) => !current)}
          >
            {showOriginal ? "Clean view" : "Original"}
          </button>
        )}
      </div>
      <div>
        <strong>{garment.name}</strong>
        <p>{garment.colour} · {garment.material}</p>
        <EvidenceBadge evidence={garment.provenance.material} />
        <button type="button" className="studio-card-edit" onClick={onEdit}>Edit piece</button>
      </div>
    </article>
  );
}

function LookThumbnail({ look }: { look: LookDna }) {
  const url = useMediaUrl(look.sourceAssetId);
  return (
    <article className="studio-look-card">
      <div>{url ? <img src={url} alt={`${look.name} inspiration look`} loading="lazy" decoding="async" /> : <span aria-hidden="true">✦</span>}</div>
      <section>
        <span>Saved Look DNA</span>
        <strong>{look.name}</strong>
        <p>{look.silhouette}</p>
        <div className="mini-palette" aria-hidden="true">
          {look.palette.map((colour) => <i key={colour} style={{ backgroundColor: colour }} />)}
        </div>
      </section>
    </article>
  );
}

interface WardrobeGalleryProps {
  garments: Garment[];
  looks: LookDna[];
  onUpdate(garment: Garment): boolean;
  onArchive(garmentId: string): boolean;
}

export function WardrobeGallery({ garments, looks, onUpdate, onArchive }: WardrobeGalleryProps) {
  const [editing, setEditing] = useState<Garment | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GarmentCategory | "all">("all");
  const [availability, setAvailability] = useState<GarmentState | "all">("all");
  const filtered = filterGarments(garments, { query, category, availability });
  const hasFilters = Boolean(query || category !== "all" || availability !== "all");
  function clearFilters(): void {
    setQuery("");
    setCategory("all");
    setAvailability("all");
  }
  if (!garments.length && !looks.length) return null;
  return (
    <section className="studio-gallery" aria-labelledby="studio-gallery-title">
      <div className="studio-gallery-heading">
        <div><h2 id="studio-gallery-title">Your private capture shelf.</h2></div>
        <span>{garments.length} {garments.length === 1 ? "piece" : "pieces"} · {looks.length} {looks.length === 1 ? "look" : "looks"}</span>
      </div>
      {garments.length > 0 && <>
        <div className="wardrobe-filters" role="search" aria-label="Find wardrobe pieces">
          <label className="wardrobe-search"><span>Search pieces</span><input type="search" placeholder="Name, colour or material" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as GarmentCategory | "all")}>
            <option value="all">All categories</option>
            <option value="top">Tops</option><option value="bottom">Bottoms</option><option value="outerwear">Outerwear</option><option value="shoes">Shoes</option><option value="accessory">Accessories</option>
          </select></label>
          <label><span>Availability</span><select value={availability} onChange={(event) => setAvailability(event.target.value as GarmentState | "all")}>
            <option value="all">All states</option>
            <option value="available">Available</option><option value="rewearable">Ready to rewear</option><option value="reserved">Reserved</option><option value="airing">Airing</option><option value="laundry">Laundry</option><option value="drying">Drying</option>
          </select></label>
          <button type="button" onClick={clearFilters} disabled={!hasFilters}>Clear filters</button>
        </div>
        <p className="wardrobe-results" role="status" aria-live="polite" aria-atomic="true">Showing {filtered.length} of {garments.length} {garments.length === 1 ? "piece" : "pieces"}</p>
        {filtered.length === 0 && <div className="wardrobe-empty"><h3>No matching pieces</h3><p>Try another name, colour or material, or clear the filters to see all your pieces.</p></div>}
      </>}
      {filtered.length > 0 && <div className="studio-garment-grid">{filtered.map((garment) => <GarmentThumbnail key={garment.id} garment={garment} onEdit={() => setEditing(garment)} />)}</div>}
      {looks.length > 0 && <div className="studio-look-grid">{looks.map((look) => <LookThumbnail key={look.id} look={look} />)}</div>}
      {editing && <GarmentEditor garment={editing} onClose={() => setEditing(null)} onSave={onUpdate} onArchive={onArchive} />}
    </section>
  );
}
