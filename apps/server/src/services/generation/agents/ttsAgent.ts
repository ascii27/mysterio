import { loadEnv } from "../../../config/env.js";
import { logger } from "../../../utils/logger.js";
import { defaultProvider } from "../../tts/index.js";
import { writeAudio } from "../../tts/storage.js";

export interface TtsAgentInput {
  mysteryId: string;
  narrativeText: string;
}

export type TtsAgentResult =
  | { ok: true; audioPath: string }
  | { ok: false; error: string };

const MAX_ATTEMPTS = 2;

export async function runTtsAgent(input: TtsAgentInput): Promise<TtsAgentResult> {
  const env = loadEnv();
  let lastErr = "";
  let buf: Buffer | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      buf = await defaultProvider.synthesize(input.narrativeText, {
        model: env.OPENAI_TTS_MODEL,
        voice: env.OPENAI_TTS_VOICE,
      });
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      logger.info("tts_provider_failed", { mystery_id: input.mysteryId, attempt, error: lastErr });
    }
  }

  if (!buf) {
    return { ok: false, error: lastErr };
  }

  try {
    const audioPath = await writeAudio(input.mysteryId, buf);
    return { ok: true, audioPath };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger.info("tts_storage_failed", { mystery_id: input.mysteryId, error: err });
    return { ok: false, error: err };
  }
}
