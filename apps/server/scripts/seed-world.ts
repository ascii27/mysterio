import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { characters, places } from "../src/db/schema.js";
import { SEED_CHARACTERS, SEED_PLACES } from "../src/db/seed/mapleHollow.js";

/** Idempotent, empty-roster-guarded world seeder. Safe to run on every deploy. */
export async function seedWorld(): Promise<{ seeded: boolean; characters: number; places: number }> {
  const db = getDb();
  const res = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM characters`);
  const n = Number((res.rows[0] as { n: number }).n);
  const placesRes = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM places`);
  const placeCount = Number((placesRes.rows[0] as { n: number }).n);
  if (n > 0) {
    return { seeded: false, characters: n, places: placeCount };
  }
  await db.insert(places).values(SEED_PLACES.map((p) => ({ ...p, is_seed: true }))).onConflictDoNothing();
  await db.insert(characters).values(SEED_CHARACTERS.map((c) => ({ ...c, is_seed: true }))).onConflictDoNothing();
  return { seeded: true, characters: SEED_CHARACTERS.length, places: SEED_PLACES.length };
}

// CLI entrypoint (parallels scripts/seed-players.ts). Only runs when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedWorld()
    .then((r) => {
      console.log(r.seeded ? `seeded ${r.characters} characters, ${r.places} places` : `roster already has ${r.characters} character(s) — skipping seed (empty-DB only).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("world seed failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
