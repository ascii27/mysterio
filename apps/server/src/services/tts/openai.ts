import OpenAI from "openai";
import { loadEnv } from "../../config/env.js";
import type { SynthesizeOpts, TTSProvider } from "./provider.js";

let _client: OpenAI | null = null;
function getOpenAi(): OpenAI {
  if (_client) return _client;
  const env = loadEnv();
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 30_000 });
  return _client;
}

export class OpenAiProvider implements TTSProvider {
  async synthesize(text: string, opts: SynthesizeOpts): Promise<Buffer> {
    const client = getOpenAi();
    const res = await client.audio.speech.create({
      model: opts.model as "tts-1-hd",
      voice: opts.voice as "fable",
      input: text,
      response_format: "mp3",
    });
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
}
