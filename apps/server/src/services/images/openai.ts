import OpenAI, { toFile } from "openai";
import { loadEnv } from "../../config/env.js";
import type { GenerateImageOpts, ImageProvider } from "./provider.js";

const VALID_IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"] as const;
type ImageSize = (typeof VALID_IMAGE_SIZES)[number];

let _client: OpenAI | null = null;
function getOpenAi(): OpenAI {
  if (_client) return _client;
  const env = loadEnv();
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
  return _client;
}

export class OpenAiImageProvider implements ImageProvider {
  async generate(prompt: string, opts: GenerateImageOpts): Promise<Buffer> {
    const client = getOpenAi();
    if (!VALID_IMAGE_SIZES.includes(opts.size as ImageSize)) {
      throw new Error(`image_provider_invalid_size: ${opts.size}`);
    }
    const res = await client.images.generate({
      model: opts.model,
      prompt,
      size: opts.size as ImageSize,
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("image_provider_no_data");
    return Buffer.from(b64, "base64");
  }

  async editWithReferences(prompt: string, references: Buffer[], opts: GenerateImageOpts): Promise<Buffer> {
    const client = getOpenAi();
    if (!VALID_IMAGE_SIZES.includes(opts.size as ImageSize)) {
      throw new Error(`image_provider_invalid_size: ${opts.size}`);
    }
    const files = await Promise.all(
      references.map((buf, i) => toFile(buf, `ref-${i}.png`, { type: "image/png" })),
    );
    const res = await client.images.edit({
      model: opts.model,
      image: files,
      prompt,
      size: opts.size as ImageSize,
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("image_provider_no_data");
    return Buffer.from(b64, "base64");
  }
}
