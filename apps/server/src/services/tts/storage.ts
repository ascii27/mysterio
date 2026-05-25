import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "../../config/env.js";

export async function writeAudio(mysteryId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const audioDir = resolve(env.AUDIO_DIR);
  await mkdir(audioDir, { recursive: true });
  const fileName = `${mysteryId}.mp3`;
  await writeFile(`${audioDir}/${fileName}`, buf);
  return fileName;
}
