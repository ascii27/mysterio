import type { ZodError } from "zod";

/**
 * Format Zod issues into a single-line, path-aware error string suitable for
 * inclusion in an LLM retry user message. Empty paths render as `(root)`.
 */
export function formatZodIssues(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}
