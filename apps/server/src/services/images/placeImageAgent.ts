import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { buildPlaceImagePrompt } from "./placeStyle.js";
import { writePlaceImage } from "./storage.js";

const PLACE_SIZE = "1024x1024";

export interface PlaceImageAgentInput {
  placeId: string;
  name: string;
  description: string;
}

export type PlaceImageAgentResult =
  | { ok: true; imagePath: string }
  | { ok: false; error: string };

export async function runPlaceImageAgent(input: PlaceImageAgentInput): Promise<PlaceImageAgentResult> {
  const env = loadEnv();
  const prompt = buildPlaceImagePrompt(input.name, input.description);

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, { model: env.OPENAI_IMAGE_MODEL, size: PLACE_SIZE });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("place_image_provider_failed", { place_id: input.placeId, error });
    return { ok: false, error };
  }

  try {
    const imagePath = await writePlaceImage(input.placeId, buf);
    return { ok: true, imagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("place_image_storage_failed", { place_id: input.placeId, error });
    return { ok: false, error };
  }
}
