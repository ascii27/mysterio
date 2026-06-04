import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "../../config/env.js";
import { shortId } from "../../utils/ids.js";

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
  const key = `avatars/${playerId}-${shortId()}.png`;
  await writeFile(`${imageDir}/${key}`, buf);
  return key;
}

/** Best-effort delete of an image by its IMAGE_DIR-relative key. No-op if the file is missing. */
export async function deleteImageByKey(key: string): Promise<void> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  try {
    await unlink(`${imageDir}/${key}`);
  } catch {
    // missing file / already gone — ignore
  }
}
