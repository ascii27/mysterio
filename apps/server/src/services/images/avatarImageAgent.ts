import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { writeAvatarImage } from "./storage.js";
import { buildAvatarPrompt } from "./avatarStyle.js";

/** Square portrait size for avatars (covers use the env landscape size). */
const AVATAR_SIZE = "1024x1024";

export interface AvatarImageAgentInput {
  playerId: string;
  description: string;
}

export type AvatarImageAgentResult =
  | { ok: true; avatarImagePath: string }
  | { ok: false; error: string };

export async function runAvatarImageAgent(
  input: AvatarImageAgentInput,
): Promise<AvatarImageAgentResult> {
  const env = loadEnv();
  const prompt = buildAvatarPrompt(input.description);

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, {
      model: env.OPENAI_IMAGE_MODEL,
      size: AVATAR_SIZE,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("avatar_image_provider_failed", { player_id: input.playerId, error });
    return { ok: false, error };
  }

  try {
    const avatarImagePath = await writeAvatarImage(input.playerId, buf);
    return { ok: true, avatarImagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("avatar_image_storage_failed", { player_id: input.playerId, error });
    return { ok: false, error };
  }
}
