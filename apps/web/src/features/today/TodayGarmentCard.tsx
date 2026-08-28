import type { Garment, GarmentState } from "@yange/domain";
import { useGarmentPhoto } from "../studio/useGarmentPhoto";

const stateLabels: Record<GarmentState, string> = {
  available: "Available",
  reserved: "Reserved",
  rewearable: "Rewearable",
  airing: "Airing",
  laundry: "Laundry",
  drying: "Drying",
};

const demoPhotography: Record<string, string> = {
  "cream-blouse": "/demo/garments/cream-blouse.webp",
  "chocolate-trousers": "/demo/garments/chocolate-trousers.webp",
  "olive-jacket": "/demo/garments/olive-jacket.webp",
  "gold-earrings": "/demo/garments/gold-earrings.webp",
  "black-loafers": "/demo/garments/black-loafers.webp",
};

function garmentTone(garment: Garment): string {
  const value = garment.colour.toLowerCase();
  if (value.includes("cream") || value.includes("ivory")) return "var(--cream)";
  if (value.includes("chocolate")) return "var(--chocolate)";
  if (value.includes("olive")) return "var(--olive)";
  if (value.includes("gold")) return "var(--champagne)";
  if (value.includes("black")) return "var(--charcoal-raised)";
  return "var(--cream-dim)";
}

export function TodayGarmentCard({ garment }: { garment: Garment }) {
  const photo = useGarmentPhoto(garment.imageAssetId);
  const imageUrl = photo.url ?? demoPhotography[garment.id] ?? null;
  const evidenceLabel = photo.url ? "Your photo" : imageUrl ? "Wardrobe piece" : "Photo pending";

  return (
    <article className="garment-tile">
      <div
        className={`garment-media ${photo.isCutout ? "is-cutout" : ""}`}
        style={photo.isCutout ? undefined : { backgroundColor: garmentTone(garment) }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${garment.name} in ${garment.colour.toLowerCase()}`}
            loading="eager"
            decoding="async"
          />
        ) : (
          <span className="garment-photo-pending">Photo pending</span>
        )}
        <span className="garment-category">{garment.category}</span>
        <span className="garment-evidence">{evidenceLabel}</span>
      </div>
      <div className="garment-details">
        <strong title={garment.name}>{garment.name}</strong>
        <span title={garment.material}>{garment.material}</span>
        <em className={`state state-${garment.state}`}>{stateLabels[garment.state]}</em>
      </div>
    </article>
  );
}
