import { isNotNull } from "drizzle-orm";
import { loadEnv } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { places } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { readImageByKey, writeWorldImage, worldImageExists } from "./storage.js";

const MAP_FILE = "town-map.png";
const MAP_SIZE = "1024x1024";

// Used when reference building images are available — composes the map FROM them so the buildings
// match the individual place illustrations.
const MAP_PROMPT_WITH_REFS =
  "Compose a single warm storybook bird's-eye illustrated map of a cozy small town called Maple Hollow, " +
  "in soft golden-hour gouache with gentle painterly texture. Place the buildings shown in the provided " +
  "reference illustrations across the frame as the town's landmarks, keeping each building's shape, style, " +
  "and colors faithful to its reference. Connect them with tree-lined streets around a central town square, " +
  "with a pond at the edge of town. Child-friendly and age-appropriate for ages 8-13, non-violent, not scary. " +
  "No text, no words, no letters, no numbers, and no labels anywhere in the image.";

// Fallback when no reference images exist yet (fresh environment).
const MAP_PROMPT_NO_REFS =
  "A warm storybook bird's-eye illustrated map of a cozy small town called Maple Hollow, soft " +
  "golden-hour gouache, rounded and inviting, gentle painterly texture. Show a town square, little " +
  "shops, a library, a bakery, a diner, a schoolhouse, a pond, and tree-lined streets, arranged " +
  "across the whole frame. Child-friendly and age-appropriate for ages 8-13, non-violent, not scary. " +
  "No text, no words, no letters, no numbers, and no labels anywhere in the image.";

export type TownMapAgentResult = { ok: true; imagePath: string } | { ok: false; error: string };

/** True if the town map already exists on disk (backfill idempotency). */
export function townMapExists(): Promise<boolean> {
  return worldImageExists(MAP_FILE);
}

/**
 * (Re)generate the town map. When reference building images are provided, the map is COMPOSED from
 * them (gpt-image-1 edit) so its buildings match the individual place images; otherwise it falls back
 * to a plain text-to-image map. Always overwrites world/town-map.png. Fail-soft — never throws.
 */
export async function runTownMapAgent(references: Buffer[] = []): Promise<TownMapAgentResult> {
  const env = loadEnv();
  let buf: Buffer;
  try {
    buf = references.length > 0
      ? await defaultImageProvider.editWithReferences(MAP_PROMPT_WITH_REFS, references, { model: env.OPENAI_IMAGE_MODEL, size: MAP_SIZE })
      : await defaultImageProvider.generate(MAP_PROMPT_NO_REFS, { model: env.OPENAI_IMAGE_MODEL, size: MAP_SIZE });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("town_map_provider_failed", { error, refs: references.length });
    return { ok: false, error };
  }
  try {
    const imagePath = await writeWorldImage(MAP_FILE, buf);
    return { ok: true, imagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("town_map_storage_failed", { error });
    return { ok: false, error };
  }
}

/** Gather every place's existing image as a reference and (re)generate the map composed from them. */
export async function generateTownMapFromPlaces(db: ReturnType<typeof getDb>): Promise<TownMapAgentResult> {
  const rows = await db.select({ image_path: places.image_path }).from(places).where(isNotNull(places.image_path));
  const refs: Buffer[] = [];
  for (const r of rows) {
    if (!r.image_path) continue;
    try {
      refs.push(await readImageByKey(r.image_path));
    } catch (e) {
      logger.info("town_map_reference_read_failed", { key: r.image_path, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return runTownMapAgent(refs);
}
