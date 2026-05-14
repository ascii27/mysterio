import { z } from "zod";
import { CATEGORY_IDS } from "../constants/categories.js";
import type { CategoryId } from "../constants/categories.js";

const idSchema = z.string().min(1).max(48).regex(/^[a-z0-9_-]+$/, "id must be lowercase kebab/snake");

export const characterRoleSchema = z.enum(["detective", "suspect", "witness", "bystander"]);
export const clueCategoryTypeSchema = z.enum(["character", "item", "location", "event", "note"]);

export const characterSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  role: characterRoleSchema,
  description: z.string().min(10).max(400),
  is_culprit: z.boolean(),
  motive: z.string().min(3).max(400).nullable(),
});

export const essentialClueSchema = z.object({
  id: idSchema,
  description: z.string().min(10).max(400),
  category_type: clueCategoryTypeSchema,
});

export const falseClueSchema = z.object({
  id: idSchema,
  description: z.string().min(10).max(400),
});

export const trueSolutionSchema = z.object({
  who_did_it: idSchema,
  how: z.string().min(10).max(400),
  why: z.string().min(10).max(400),
});

export const logicStructureSchema = z.object({
  category: z.enum(CATEGORY_IDS as unknown as [CategoryId, ...CategoryId[]]),
  setting: z.string().min(10).max(400),
  characters: z.array(characterSchema).min(3).max(8),
  essential_clues: z.array(essentialClueSchema).min(3).max(8),
  false_clues: z.array(falseClueSchema).min(0).max(10),
  true_solution: trueSolutionSchema,
  logic_chain: z.array(z.string().min(10).max(400)).min(3).max(8),
}).superRefine((val, ctx) => {
  const culprits = val.characters.filter((c) => c.is_culprit);
  if (culprits.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `exactly one character must have is_culprit=true (found ${culprits.length})` });
  }
  if (culprits[0] && val.true_solution.who_did_it !== culprits[0].id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "true_solution.who_did_it must match the culprit's character id" });
  }
  const charIds = new Set(val.characters.map((c) => c.id));
  if (!charIds.has(val.true_solution.who_did_it)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "true_solution.who_did_it must reference an existing character id" });
  }
  const seenClueIds = new Set<string>();
  for (const c of [...val.essential_clues, ...val.false_clues]) {
    if (seenClueIds.has(c.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate clue id: ${c.id}` });
    }
    seenClueIds.add(c.id);
  }
});

