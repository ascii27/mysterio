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
  how_distractors: z.array(z.string().min(3).max(200)).length(3),
  why_distractors: z.array(z.string().min(3).max(200)).length(3),
  logic_chain: z.array(z.string().min(10).max(400)).min(3).max(8),
  central_question: z.string().min(10).max(300),
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
  // Exactly one detective
  const detectives = val.characters.filter((c) => c.role === "detective");
  if (detectives.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `exactly one character must have role "detective" (found ${detectives.length})`,
    });
  }
  // Detective is never the culprit
  const detective = detectives[0];
  if (detective && detective.is_culprit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `the detective character must not be the culprit`,
    });
  }
  // central_question must not name the culprit (fair play — same rule as essential clues)
  const theCulprit = culprits[0];
  if (theCulprit && val.central_question.toLowerCase().includes(theCulprit.name.toLowerCase())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "central_question must not name the culprit",
    });
  }
  const seenClueIds = new Set<string>();
  for (const c of [...val.essential_clues, ...val.false_clues]) {
    if (seenClueIds.has(c.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate clue id: ${c.id}` });
    }
    seenClueIds.add(c.id);
  }
  // M6: distractors must be distinct from the true answer and from each other
  if (val.how_distractors.includes(val.true_solution.how)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "how_distractors must not contain the true solution's how" });
  }
  if (new Set(val.how_distractors).size !== val.how_distractors.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "how_distractors must contain 3 distinct strings" });
  }
  if (val.why_distractors.includes(val.true_solution.why)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "why_distractors must not contain the true solution's why" });
  }
  if (new Set(val.why_distractors).size !== val.why_distractors.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "why_distractors must contain 3 distinct strings" });
  }
});

