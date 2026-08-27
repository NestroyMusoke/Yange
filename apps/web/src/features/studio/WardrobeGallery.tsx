import { useState } from "react";
import type { Garment, LookDna } from "@yange/domain";
import { EvidenceBadge } from "./EvidenceBadge";
import { GarmentEditor } from "./GarmentEditor";
import { useMediaUrl } from "./useCaptureQueue";

function GarmentThumbnail({ garment, onEdit }: { garment: Garment; onEdit(): void }) {
  const url = useMediaUrl(garment.imageAssetId);
  return (
    <article className="studio-garment-card">
      <div className="studio-garment-image">
        {url ? <img src={url} alt={`${garment.name} wardrobe photo`} loading="lazy" decoding="async" /> : <span>{garment.category}</span>}
        <em>{garment.state}</em>
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
  if (!garments.length && !looks.length) return null;
  return (
    <section className="studio-gallery" aria-labelledby="studio-gallery-title">
      <div className="studio-gallery-heading">
        <div><h2 id="studio-gallery-title">Your private capture shelf.</h2></div>
        <span>{garments.length} {garments.length === 1 ? "piece" : "pieces"} · {looks.length} {looks.length === 1 ? "look" : "looks"}</span>
      </div>
      {garments.length > 0 && <div className="studio-garment-grid">{garments.map((garment) => <GarmentThumbnail key={garment.id} garment={garment} onEdit={() => setEditing(garment)} />)}</div>}
      {looks.length > 0 && <div className="studio-look-grid">{looks.map((look) => <LookThumbnail key={look.id} look={look} />)}</div>}
      {editing && <GarmentEditor garment={editing} onClose={() => setEditing(null)} onSave={onUpdate} onArchive={onArchive} />}
    </section>
  );
}
