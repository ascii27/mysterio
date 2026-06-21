import { z } from "zod";

/** Mirrors logicStructure.ts idSchema — roster/place ids round-trip into logic_structure_json character ids. */
const idSchema = z.string().min(1).max(48).regex(/^[a-z0-9_-]+$/, "id must be lowercase kebab/snake");

/** role this character played in ONE case. NOT "detective" — that's the player. */
export const roleInCaseSchema = z.enum(["suspect", "witness", "bystander"]);

/** Persistent identity row — never carries per-case guilt. created_at is an ISO string on the wire. */
export const rosterCharacterSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(600),
  traits: z.string().max(400).nullable(),
  portrait_image_path: z.string().nullable(),
  is_seed: z.boolean(),
  created_at: z.string(),
});

export const placeSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(600),
  image_path: z.string().nullable(),
  is_seed: z.boolean(),
  created_at: z.string(),
});

export const caseAppearanceSchema = z.object({
  id: z.string().min(1).max(120),
  mystery_id: z.string().min(1),
  character_id: z.string().min(1),
  role_in_case: roleInCaseSchema,
  is_culprit: z.boolean(),
  motive: z.string().nullable(),
  created_at: z.string(),
});
