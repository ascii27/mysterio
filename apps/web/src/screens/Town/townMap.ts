/**
 * Authored hotspot positions (percent of the map box) for each seed place.
 * Tuned to the reference-composed Maple Hollow map (world/town-map.png): markers sit on the
 * building that depicts each place; places without a clear building are placed sensibly.
 */
export interface Hotspot { id: string; topPct: number; leftPct: number; }

export const TOWN_HOTSPOTS: Hotspot[] = [
  { id: "maple-diner", topPct: 19, leftPct: 17 },       // rounded glass diner, upper-left (maple leaf)
  { id: "schoolhouse", topPct: 32, leftPct: 49 },       // big central red-brick building
  { id: "clocktower-square", topPct: 48, leftPct: 53 }, // cobbled plaza below the clock tower
  { id: "town-library", topPct: 29, leftPct: 87 },      // stone building, upper-right
  { id: "post-office", topPct: 46, leftPct: 14 },       // small house, left-center
  { id: "garage", topPct: 63, leftPct: 77 },            // right-center building by the wheel
  { id: "millpond", topPct: 72, leftPct: 84 },          // the water wheel
  { id: "the-bakery", topPct: 75, leftPct: 47 },        // green-awning building, lower-center
  { id: "general-store", topPct: 82, leftPct: 16 },     // big timber building, lower-left
];
