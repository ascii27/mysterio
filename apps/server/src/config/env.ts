import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_TTS_MODEL: z.string().default("tts-1-hd"),
  OPENAI_TTS_VOICE: z.string().default("fable"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  OPENAI_IMAGE_SIZE: z.string().default("1536x1024"),
  IMAGE_DIR: z.string().default("./data/images"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_PATH: z.string().default("./data/mysterio.db"),
  AUDIO_DIR: z.string().default("./data/audio"),
  MAX_VALIDATION_ATTEMPTS: z.coerce.number().int().positive().default(3),
  MAX_NARRATIVE_ATTEMPTS: z.coerce.number().int().positive().default(2),
  MAX_READTHROUGH_ATTEMPTS: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
