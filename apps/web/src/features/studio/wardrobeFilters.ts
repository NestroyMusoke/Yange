import type { Garment, GarmentCategory, GarmentState } from "@yange/domain";

interface WardrobeFilters {
  query: string;
  category: GarmentCategory | "all";
  availability: GarmentState | "all";
}

export function filterGarments(garments: Garment[], filters: WardrobeFilters): Garment[] {
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return garments.filter((garment) => {
    if (filters.category !== "all" && garment.category !== filters.category) return false;
    if (filters.availability !== "all" && garment.state !== filters.availability) return false;
    const text = `${garment.name} ${garment.colour} ${garment.material}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
