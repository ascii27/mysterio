import { eq, isNull } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { characters, places } from "../src/db/schema.js";
import { logger } from "../src/utils/logger.js";
import { runCharacterPortraitAgent } from "../src/services/images/characterPortraitAgent.js";
import { runPlaceImageAgent } from "../src/services/images/placeImageAgent.js";
import { generateTownMapFromPlaces, townMapExists } from "../src/services/images/townMapAgent.js";

type Db = ReturnType<typeof getDb>;

export interface BackfillDeps {
  generatePortrait: (id: string, description: string) => Promise<{ ok: true; portraitImagePath: string } | { ok: false; error: string }>;
  generatePlaceImage: (id: string, name: string, description: string) => Promise<{ ok: true; imagePath: string } | { ok: false; error: string }>;
  townMapExists: () => Promise<boolean>;
  generateTownMap: () => Promise<{ ok: true; imagePath: string } | { ok: false; error: string }>;
}

const defaultDeps: BackfillDeps = {
  generatePortrait: (id, description) => runCharacterPortraitAgent({ characterId: id, description }),
  generatePlaceImage: (id, name, description) => runPlaceImageAgent({ placeId: id, name, description }),
  townMapExists,
  generateTownMap: () => generateTownMapFromPlaces(getDb()),
};

/**
 * Idempotent + fail-soft image backfill. Generates only for rows whose image path is null and the
 * map only if it's missing — so re-running on every deploy is a no-op once populated (cost guard).
 * Any single failure is logged and skipped; the function never throws on a generation error.
 */
export async function backfillImages(db: Db, deps: BackfillDeps = defaultDeps): Promise<{ portraits: number; places: number; map: boolean }> {
  let portraits = 0;
  let placeImgs = 0;
  let map = false;

  const charRows = await db.select().from(characters).where(isNull(characters.portrait_image_path));
  for (const c of charRows) {
    const res = await deps.generatePortrait(c.id, c.description);
    if (res.ok) {
      await db.update(characters).set({ portrait_image_path: res.portraitImagePath }).where(eq(characters.id, c.id));
      portraits++;
    } else {
      logger.info("backfill_portrait_failed", { character_id: c.id, error: res.error });
    }
  }

  const placeRows = await db.select().from(places).where(isNull(places.image_path));
  for (const p of placeRows) {
    const res = await deps.generatePlaceImage(p.id, p.name, p.description);
    if (res.ok) {
      await db.update(places).set({ image_path: res.imagePath }).where(eq(places.id, p.id));
      placeImgs++;
    } else {
      logger.info("backfill_place_image_failed", { place_id: p.id, error: res.error });
    }
  }

  if (!(await deps.townMapExists())) {
    const res = await deps.generateTownMap();
    if (res.ok) map = true;
    else logger.info("backfill_town_map_failed", { error: res.error });
  }

  return { portraits, places: placeImgs, map };
}

// CLI entrypoint (parallels scripts/seed-world.ts). Only runs when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillImages(getDb())
    .then((r) => {
      console.log(`backfilled ${r.portraits} portrait(s), ${r.places} place image(s), map=${r.map ? "generated" : "skipped"}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("image backfill failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
