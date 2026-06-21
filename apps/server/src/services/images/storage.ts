import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "../../config/env.js";
import { shortId } from "../../utils/ids.js";
import { logger } from "../../utils/logger.js";

export async function writeCoverImage(mysteryId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  await mkdir(imageDir, { recursive: true });
  const fileName = `${mysteryId}.png`;
  await writeFile(`${imageDir}/${fileName}`, buf);
  return fileName;
}

/** Writes a versioned avatar PNG and returns its key (relative to IMAGE_DIR), e.g. "avatars/p1-ab12cd34.png". */
export async function writeAvatarImage(playerId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  const dir = `${imageDir}/avatars`;
  await mkdir(dir, { recursive: true });
  const fileName = `${playerId}-${shortId()}.png`;
  await writeFile(`${dir}/${fileName}`, buf);
  return `avatars/${fileName}`;
}

/** Writes a versioned character portrait PNG and returns its key (relative to IMAGE_DIR), e.g. "characters/rosa-pine-ab12cd34.png". */
export async function writePortraitImage(characterId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  const dir = `${imageDir}/characters`;
  await mkdir(dir, { recursive: true });
  const fileName = `${characterId}-${shortId()}.png`;
  await writeFile(`${dir}/${fileName}`, buf);
  return `characters/${fileName}`;
}

/** Best-effort delete of an image by its IMAGE_DIR-relative key. No-op if the file is missing. */
export async function deleteImageByKey(key: string): Promise<void> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  try {
    await unlink(`${imageDir}/${key}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.info("avatar_delete_failed", { key, err: err instanceof Error ? err.message : String(err) });
    }
    // ENOENT (already gone) is the expected no-op case — ignore.
  }
}
