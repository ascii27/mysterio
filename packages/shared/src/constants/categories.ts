export const CATEGORIES = [
  {
    id: "missing-pet",
    name: "The Missing Pet",
    blurb: "A beloved animal has vanished from somewhere familiar.",
    tone: "cozy",
  },
  {
    id: "haunted-mansion",
    name: "The Haunted Mansion",
    blurb: "Strange noises and creaking doors at an old country house.",
    tone: "spooky-mild",
  },
  {
    id: "stolen-treasure",
    name: "The Stolen Treasure",
    blurb: "Something precious is missing — and it didn't walk away.",
    tone: "adventure",
  },
  {
    id: "locked-room",
    name: "The Locked Room",
    blurb: "Impossible: only one way in, and it was locked.",
    tone: "classic",
  },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as readonly CategoryId[];
