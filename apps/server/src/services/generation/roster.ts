import { getDb } from "../../db/client.js";
import { characters, places } from "../../db/schema.js";

type Db = ReturnType<typeof getDb>;

export interface CastPoolCharacter {
  id: string;
  name: string;
  description: string;
  traits: string | null;
}
export interface CastPoolPlace {
  id: string;
  name: string;
  description: string;
}
export interface CastPool {
  characters: CastPoolCharacter[];
  places: CastPoolPlace[];
}

/** Pick a random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Return a random subset of `arr` whose size is clamp(desired, 0, arr.length). */
function pickRandom<T>(arr: T[], min: number, max: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i] as T;
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = tmp;
  }
  const want = Math.min(randInt(min, max), shuffled.length);
  return shuffled.slice(0, want);
}

/**
 * Select a cast pool for one mystery: 4-6 roster characters + 1-2 places.
 * Returns an EMPTY pool if the roster is empty — generation then falls back to
 * its legacy behavior (model invents the cast freely). Never throws on empty.
 */
export async function selectCastPool(db: Db): Promise<CastPool> {
  const chars = await db
    .select({ id: characters.id, name: characters.name, description: characters.description, traits: characters.traits })
    .from(characters);
  const plcs = await db
    .select({ id: places.id, name: places.name, description: places.description })
    .from(places);
  return {
    characters: pickRandom(chars, 4, 6),
    places: pickRandom(plcs, 1, 2),
  };
}
