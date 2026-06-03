import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "../../config/env.js";

export async function writeCoverImage(mysteryId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  await mkdir(imageDir, { recursive: true });
  const fileName = `${mysteryId}.png`;
  await writeFile(`${imageDir}/${fileName}`, buf);
  return fileName;
}
