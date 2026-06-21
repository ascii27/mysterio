import { eq, inArray } from "drizzle-orm";
import type { LogicStructure } from "@mysterio/shared";
import { getDb } from "../../db/client.js";
import { caseAppearances, characters, mysteries, places } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";

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

export interface ExtractArgs {
  mysteryId: string;
  logic: LogicStructure;
  /** The cast pool's places, used to match a roster place_id from the free-text setting. */
  places: Pick<CastPoolPlace, "id" | "name">[];
}

/**
 * Derive the World tables from a finalized mystery's logic structure:
 *  - upsert any NEW resident (role != detective, id not already in `characters`) — identity only;
 *  - write one case_appearances row per non-detective character (role/culprit/motive);
 *  - set mysteries.place_id when a pool place's name appears in the setting.
 * Idempotent (unique mystery_id+character_id). The CALLER wraps this in try/catch (fail-soft):
 * a throw here must never fail an otherwise-good mystery.
 */
export async function extractAppearances(db: Db, args: ExtractArgs): Promise<void> {
  const { mysteryId, logic } = args;
  const cast = logic.characters.filter((c) => c.role !== "detective");
  if (cast.length === 0) return;

  // Which cast members already exist in `characters`?
  const ids = cast.map((c) => c.id);
  const existing = await db.select({ id: characters.id }).from(characters).where(inArray(characters.id, ids));
  const existingIds = new Set(existing.map((r) => r.id));
  const newOnes = cast.filter((c) => !existingIds.has(c.id));

  if (newOnes.length > 1) {
    // Soft over-invention guard: persist all, but flag it. Never reject a good mystery.
    logger.info("extract_over_invention", { mystery_id: mysteryId, new_count: newOnes.length, ids: newOnes.map((c) => c.id) });
  }

  // Upsert new residents (identity only — NO role/culprit/motive lives in `characters`).
  if (newOnes.length > 0) {
    await db
      .insert(characters)
      .values(newOnes.map((c) => ({ id: c.id, name: c.name, description: c.description, traits: null, is_seed: false })))
      .onConflictDoNothing();
  }

  // Write per-case appearances (idempotent on (mystery_id, character_id)).
  await db
    .insert(caseAppearances)
    .values(
      cast.map((c) => ({
        id: `${mysteryId}_${c.id}`,
        mystery_id: mysteryId,
        character_id: c.id,
        role_in_case: c.role, // 'suspect' | 'witness' | 'bystander' (detective already filtered)
        is_culprit: c.is_culprit,
        motive: c.motive,
      })),
    )
    .onConflictDoNothing();

  // Match a roster place_id by case-insensitive name substring in the setting.
  const setting = logic.setting.toLowerCase();
  const matched = args.places.find((p) => setting.includes(p.name.toLowerCase()));
  if (matched) {
    await db.update(mysteries).set({ place_id: matched.id }).where(eq(mysteries.id, mysteryId));
  }
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
