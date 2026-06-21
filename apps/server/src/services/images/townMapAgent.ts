import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { writeWorldImage, worldImageExists } from "./storage.js";

const MAP_FILE = "town-map.png";
const MAP_SIZE = "1024x1024";

const MAP_PROMPT =
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

export async function runTownMapAgent(): Promise<TownMapAgentResult> {
  const env = loadEnv();
  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(MAP_PROMPT, { model: env.OPENAI_IMAGE_MODEL, size: MAP_SIZE });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("town_map_provider_failed", { error });
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
