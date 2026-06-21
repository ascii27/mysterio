import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { buildPortraitPrompt } from "./portraitStyle.js";
import { writePortraitImage } from "./storage.js";

/** Square portrait size for characters (covers use the env landscape size). */
const PORTRAIT_SIZE = "1024x1024";

export interface CharacterPortraitAgentInput {
  characterId: string;
  description: string;
}

export type CharacterPortraitAgentResult =
  | { ok: true; portraitImagePath: string }
  | { ok: false; error: string };

export async function runCharacterPortraitAgent(
  input: CharacterPortraitAgentInput,
): Promise<CharacterPortraitAgentResult> {
  const env = loadEnv();
  const prompt = buildPortraitPrompt(input.description);

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, { model: env.OPENAI_IMAGE_MODEL, size: PORTRAIT_SIZE });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("portrait_image_provider_failed", { character_id: input.characterId, error });
    return { ok: false, error };
  }

  try {
    const portraitImagePath = await writePortraitImage(input.characterId, buf);
    return { ok: true, portraitImagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("portrait_image_storage_failed", { character_id: input.characterId, error });
    return { ok: false, error };
  }
}
