/** Qloo suggests places; Yange retains authority over wardrobe decisions. */
export interface TasteEntity {
  id: string;
  name: string;
  type: string;
}
export interface TastePlace extends TasteEntity {
  address: string | null;
}
export interface OutingSuggestions {
  source: "qloo";
  city: string;
  interestIds: string[];
  fetchedAt: string;
  places: TastePlace[];
}
export interface TasteProvider {
  search(query: string): Promise<TasteEntity[]>;
  recommend(city: string, interestIds: string[]): Promise<OutingSuggestions>;
}
export const QLOO_ENTITY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
