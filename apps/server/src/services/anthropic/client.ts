import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const env = loadEnv();
  _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export interface ClaudeJsonCallOptions {
  system: Array<{ type: "text"; text: string; cache?: boolean }>;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** debug-friendly label for logs */
  label: string;
}

/** Returns the model's text response (concatenated from text blocks). Caller is responsible for JSON.parse. */
export async function claudeText(opts: ClaudeJsonCallOptions): Promise<string> {
  const env = loadEnv();
  const client = getAnthropic();
  const start = Date.now();

  const systemBlocks = opts.system.map((s) =>
    s.cache
      ? { type: "text" as const, text: s.text, cache_control: { type: "ephemeral" as const } }
      : { type: "text" as const, text: s.text },
  );

  const res = await client.beta.promptCaching.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    system: systemBlocks,
    messages: [{ role: "user", content: opts.user }],
  });

  const text = res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const usage = res.usage;
  logger.info("claude_call", {
    label: opts.label,
    ms: Date.now() - start,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? undefined,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? undefined,
  });

  return text;
}

/** Strip markdown code fences and surrounding prose so JSON.parse can consume. */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenced) return fenced[1]!.trim();
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return raw.slice(firstBrace, lastBrace + 1);
  return raw.trim();
}
