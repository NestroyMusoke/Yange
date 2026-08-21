import type { Garment } from "@yange/domain";
import { useMediaUrl } from "../studio/useCaptureQueue";

function garmentTone(garment: Garment): string {
  const value = garment.colour.toLowerCase();
  if (value.includes("cream") || value.includes("ivory")) return "#d9ccb3";
  if (value.includes("chocolate")) return "#6e4937";
  if (value.includes("olive")) return "#626d4b";
  if (value.includes("indigo")) return "#4f5675";
  if (value.includes("terracotta")) return "#b96f52";
  if (value.includes("gold")) return "#b99b55";
  if (value.includes("black")) return "#292a28";
  return "#77756f";
}

export function GarmentPreview({ garment, compact = false }: { garment: Garment; compact?: boolean }) {
  const imageUrl = useMediaUrl(garment.imageAssetId);
  return (
    <div className={`intelligence-garment ${compact ? "is-compact" : ""}`}>
      <div style={{ backgroundColor: garmentTone(garment) }}>
        {imageUrl && <img src={imageUrl} alt="" loading="lazy" decoding="async" />}
        <span>{garment.category}</span>
      </div>
      <section>
        <strong>{garment.name}</strong>
        <small>{garment.state}</small>
      </section>
    </div>
  );
}
