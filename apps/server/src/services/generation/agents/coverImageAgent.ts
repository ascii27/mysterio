import type { CategoryId } from "@mysterio/shared";
import { loadEnv } from "../../../config/env.js";
import { logger } from "../../../utils/logger.js";
import { defaultImageProvider } from "../../images/index.js";
import { writeCoverImage } from "../../images/storage.js";
import { buildCoverPrompt } from "../../images/style.js";

export interface CoverImageAgentInput {
  mysteryId: string;
  category: CategoryId;
  title: string;
  centralQuestion: string;
  setting: string;
}

export type CoverImageAgentResult =
  | { ok: true; coverImagePath: string }
  | { ok: false; error: string };

export async function runCoverImageAgent(
  input: CoverImageAgentInput,
): Promise<CoverImageAgentResult> {
  const env = loadEnv();
  const prompt = buildCoverPrompt({
    category: input.category,
    title: input.title,
    centralQuestion: input.centralQuestion,
    setting: input.setting,
  });

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, {
      model: env.OPENAI_IMAGE_MODEL,
      size: env.OPENAI_IMAGE_SIZE,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("cover_image_provider_failed", { mystery_id: input.mysteryId, error });
    return { ok: false, error };
  }

  try {
    const coverImagePath = await writeCoverImage(input.mysteryId, buf);
    return { ok: true, coverImagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("cover_image_storage_failed", { mystery_id: input.mysteryId, error });
    return { ok: false, error };
  }
}
