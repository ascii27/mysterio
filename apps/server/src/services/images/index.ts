import { OpenAiImageProvider } from "./openai.js";
import type { ImageProvider } from "./provider.js";

export type { GenerateImageOpts, ImageProvider } from "./provider.js";

export const defaultImageProvider: ImageProvider = new OpenAiImageProvider();
