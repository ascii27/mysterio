import { OpenAiProvider } from "./openai.js";
import type { TTSProvider } from "./provider.js";

export type { SynthesizeOpts, TTSProvider } from "./provider.js";

export const defaultProvider: TTSProvider = new OpenAiProvider();
