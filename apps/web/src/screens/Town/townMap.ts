/** Authored hotspot positions (percent of the map box) for each seed place. */
export const TOWN_MAP_IMAGE = "/images/world/town-map.png";

export interface Hotspot { id: string; topPct: number; leftPct: number; }

export const TOWN_HOTSPOTS: Hotspot[] = [
  { id: "schoolhouse", topPct: 20, leftPct: 48 },
  { id: "clocktower-square", topPct: 45, leftPct: 48 },
  { id: "maple-diner", topPct: 30, leftPct: 25 },
  { id: "town-library", topPct: 28, leftPct: 70 },
  { id: "post-office", topPct: 40, leftPct: 14 },
  { id: "general-store", topPct: 60, leftPct: 30 },
  { id: "the-bakery", topPct: 62, leftPct: 64 },
  { id: "garage", topPct: 55, leftPct: 82 },
  { id: "millpond", topPct: 80, leftPct: 46 },
];
