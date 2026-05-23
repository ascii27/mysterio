# M5b Implementation Plan — Annotated narrative + auto-Notes from taps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Highlight people (color-coded by role) and clues (gold) in the narrative prose. Tapping a highlight opens the ClueTracker drawer focused on a just-added auto-populated note that the kid can edit.

**Architecture:** Narrative agent emits prose with inline `[p:<char-id>]…[/p]` and `[c:<clue-id>]…[/c]` tags. Server-side parser strips them into clean text + a `NarrativeAnnotation[]` array stored alongside in DB. Frontend renders pill highlights on the clean text using the annotations' offsets; tap auto-POSTs a clue with `source:"annotation"` + `annotation_id` (dedupe via partial unique index), then opens the ClueTracker drawer in focused mode on the just-added row.

**Tech Stack:** Fastify 5, Drizzle (better-sqlite3) + drizzle-kit migrations, Anthropic SDK 0.96.0, Zod 3, React 18 + Vite, TanStack Query 5, vitest.

**Source spec:** `docs/superpowers/specs/2026-05-17-m5-kid-onboarding-design.md` § M5b (approved 2026-05-17). M5a shipped successfully 2026-05-17 and was iPad-validated by the user; M5b is unblocked.

**Continue using:** sonnet for implementer + reviewer subagents (per `workflow_model_selection` memory); per-task review pattern of implementer → spec compliance → code quality → fix → re-review (per `workflow_subagent_driven` memory).

**Plan-text bugs implementer is authorized to silently fix** (per `feedback_plan_text_bugs` memory): `.ts` → `.js` import extensions, TypeScript syntax errors that don't compile, stale SDK casts. The plan already uses `.js`; no silent fixes expected.

---

## Task M5b.1: DB migration (mysteries.narrative_annotations + clues.source + clues.annotation_id + unique partial index)

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/migrations/0001_<random>.sql` (drizzle-kit will generate the name)
- Create: `apps/server/src/db/migrations/meta/0001_snapshot.json` (drizzle-kit will generate)
- Modify: `apps/server/src/db/migrations/meta/_journal.json` (drizzle-kit will append entry)

- [ ] **Step 1: Update `apps/server/src/db/schema.ts`**

Three updates: add a column to `mysteries`, add two columns + a unique partial index to `clues`. Find the `mysteries` block and add `narrative_annotations: text("narrative_annotations"),` right after `narrative_text`:

```ts
export const mysteries = sqliteTable("mysteries", {
  id: text("id").primaryKey(),
  player_id: text("player_id").notNull().references(() => players.id),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  status: text("status").notNull(),
  title: text("title"),
  logic_structure_json: text("logic_structure_json"),
  narrative_text: text("narrative_text"),
  narrative_annotations: text("narrative_annotations"),
  audio_path: text("audio_path"),
  validation_passed: integer("validation_passed"),
  validation_attempts: integer("validation_attempts").notNull().default(0),
  validation_notes: text("validation_notes"),
  failure_reason: text("failure_reason"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch())`),
  ready_at: integer("ready_at"),
}, (t) => ({
  // ... existing constraints unchanged ...
}));
```

Find the `clues` block and add the two new columns + index. Replace the block with:

```ts
export const clues = sqliteTable("clues", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  category_type: text("category_type").notNull(),
  content: text("content").notNull(),
  audio_timestamp_ms: integer("audio_timestamp_ms"),
  source: text("source").notNull().default("manual"),
  annotation_id: text("annotation_id"),
  created_at: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (t) => ({
  categoryCheck: check(
    "clues_category_chk",
    sql`${t.category_type} IN ('character','item','location','event','note')`,
  ),
  sourceCheck: check(
    "clues_source_chk",
    sql`${t.source} IN ('manual','annotation')`,
  ),
  mysteryIdx: index("idx_clues_mystery").on(t.mystery_id),
  annotationUniq: uniqueIndex("clues_mystery_annotation_uniq")
    .on(t.mystery_id, t.annotation_id)
    .where(sql`${t.annotation_id} IS NOT NULL`),
}));
```

- [ ] **Step 2: Generate the migration file**

```bash
pnpm --filter @mysterio/server db:generate
```
Expected output: drizzle-kit creates a new file like `apps/server/src/db/migrations/0001_<random>.sql` containing the ALTER TABLE / CREATE UNIQUE INDEX statements. It also updates `meta/_journal.json` and creates `meta/0001_snapshot.json`. Inspect the generated SQL — it should contain (in some order):

```sql
ALTER TABLE `mysteries` ADD `narrative_annotations` text;
ALTER TABLE `clues` ADD `source` text DEFAULT 'manual' NOT NULL;
ALTER TABLE `clues` ADD `annotation_id` text;
CREATE UNIQUE INDEX `clues_mystery_annotation_uniq` ON `clues` (`mystery_id`,`annotation_id`) WHERE "clues"."annotation_id" IS NOT NULL;
```

If the CHECK constraint on `source` is emitted as a separate `CREATE TABLE` (drizzle's SQLite handling of new CHECKs sometimes does this), accept what drizzle generates — the constraint is defense-in-depth and the DEFAULT 'manual' covers normal traffic.

- [ ] **Step 3: Apply the migration locally**

```bash
pnpm --filter @mysterio/server db:migrate
```
Expected output: `migrations applied`.

Verify the new columns exist:
```bash
sqlite3 data/mysterio.db ".schema mysteries" | grep narrative_annotations
sqlite3 data/mysterio.db ".schema clues" | grep -E "source|annotation_id"
sqlite3 data/mysterio.db ".schema clues_mystery_annotation_uniq"
```
Expected: each grep returns the matching definition line.

Also confirm existing rows backfill correctly:
```bash
sqlite3 data/mysterio.db "SELECT id, source, annotation_id FROM clues LIMIT 5;"
```
Expected: every existing row shows `source=manual` and `annotation_id=` (empty/null) — the DEFAULT and NULL columns are applied.

- [ ] **Step 4: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean, 14 passed + 1 skipped (no new tests in this task).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/migrations/
git commit -m "$(cat <<'EOF'
M5b.1: DB migration — narrative_annotations + clue source/annotation_id

mysteries.narrative_annotations: TEXT (JSON-stringified
NarrativeAnnotation[], nullable for pre-M5b rows).
clues.source: TEXT NOT NULL DEFAULT 'manual' + CHECK in ('manual','annotation').
clues.annotation_id: TEXT nullable.
clues_mystery_annotation_uniq: UNIQUE INDEX on (mystery_id, annotation_id)
WHERE annotation_id IS NOT NULL — partial unique so manual rows don't conflict.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.2: Shared types — NarrativeAnnotation + Clue extensions

**Files:**
- Create: `packages/shared/src/types/narrativeAnnotation.ts`
- Modify: `packages/shared/src/types/clue.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: NarrativeAnnotation type**

Create `packages/shared/src/types/narrativeAnnotation.ts`:

```ts
/**
 * A region of the clean narrative text that was tagged by the LLM with an inline
 * `[p:<id>]...[/p]` (person) or `[c:<id>]...[/c]` (clue) marker. The frontend
 * uses these to render pill highlights and wire tap → auto-add-to-notes.
 */
export interface NarrativeAnnotation {
  type: "person" | "clue";
  /** character.id for type:"person" or essential_clues[i].id for type:"clue" */
  id: string;
  /** Index (0-based, code units) into the CLEAN narrative text where the highlighted span starts */
  offset: number;
  /** Length of the highlighted span in the clean text */
  length: number;
  /** The original text that was inside the tags (e.g., "Oliver" or "trail of clover sprigs") */
  text: string;
}
```

- [ ] **Step 2: Extend the Clue interface**

Replace the contents of `packages/shared/src/types/clue.ts`:

```ts
import type { ClueCategoryType } from "./logicStructure.js";

export type ClueSource = "manual" | "annotation";

export interface Clue {
  id: string;
  mystery_id: string;
  category_type: ClueCategoryType;
  content: string;
  audio_timestamp_ms: number | null;
  source: ClueSource;
  annotation_id: string | null;
  created_at: number;
}
```

- [ ] **Step 3: Re-export from the shared barrel**

Append to `packages/shared/src/index.ts`:

```ts
export * from "./types/narrativeAnnotation.js";
```

(`ClueSource` and the updated `Clue` flow through the existing `export * from "./types/clue.js"` line.)

- [ ] **Step 4: Build + typecheck**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/shared typecheck
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "$(cat <<'EOF'
M5b.2: shared types — NarrativeAnnotation, ClueSource, Clue.source/annotation_id

NarrativeAnnotation describes a tagged region in the clean narrative
text (type + id + offset + length + text). The parser produces these;
the frontend consumes them for pill rendering. Clue gains source
("manual" | "annotation") and annotation_id (composite of <type>-<id>
for dedupe per mystery).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.3: parseAnnotations util + tests

**Files:**
- Create: `apps/server/src/services/generation/parseAnnotations.ts`
- Create: `apps/server/src/services/generation/parseAnnotations.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `apps/server/src/services/generation/parseAnnotations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LogicStructure } from "@mysterio/shared";
import { parseNarrativeAnnotations } from "./parseAnnotations.js";

function ls(): LogicStructure {
  return {
    category: "missing-pet",
    setting: "A backyard on a Saturday morning.",
    characters: [
      { id: "lily", name: "Lily", role: "detective", description: "...", is_culprit: false, motive: null },
      { id: "oliver", name: "Oliver", role: "suspect", description: "...", is_culprit: true, motive: "to keep Snowdrop company" },
      { id: "jasper", name: "Jasper", role: "suspect", description: "...", is_culprit: false, motive: null },
    ],
    essential_clues: [
      { id: "clover-trail", description: "A trail of fresh clover sprigs.", category_type: "item" },
      { id: "empty-hutch", description: "Sounds from an empty hutch.", category_type: "location" },
      { id: "grandma-note", description: "A note about a grandma visiting.", category_type: "note" },
    ],
    false_clues: [],
    true_solution: { who_did_it: "oliver", how: "x", why: "y" },
    logic_chain: ["a", "b", "c"],
  } as LogicStructure;
}

describe("parseNarrativeAnnotations", () => {
  it("returns the input unchanged when there are no tags", () => {
    const input = "It was a quiet morning. Nothing was tagged.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe(input);
    expect(out.annotations).toEqual([]);
  });

  it("extracts a single person tag and computes the offset in clean text", () => {
    const input = "Lily knelt by the hutch. [p:oliver]Oliver[/p] lived two houses down.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Lily knelt by the hutch. Oliver lived two houses down.");
    expect(out.annotations).toEqual([
      { type: "person", id: "oliver", offset: 25, length: 6, text: "Oliver" },
    ]);
  });

  it("extracts a single clue tag", () => {
    const input = "She saw a [c:clover-trail]trail of clover sprigs[/c] across the grass.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("She saw a trail of clover sprigs across the grass.");
    expect(out.annotations).toEqual([
      { type: "clue", id: "clover-trail", offset: 10, length: 22, text: "trail of clover sprigs" },
    ]);
  });

  it("handles multiple tags in order, with correct offsets after stripping", () => {
    const input = "[p:oliver]Oliver[/p] left a [c:clover-trail]trail of clover[/c]. [p:jasper]Jasper[/p] watched.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Oliver left a trail of clover. Jasper watched.");
    expect(out.annotations).toEqual([
      { type: "person", id: "oliver", offset: 0, length: 6, text: "Oliver" },
      { type: "clue", id: "clover-trail", offset: 14, length: 15, text: "trail of clover" },
      { type: "person", id: "jasper", offset: 31, length: 6, text: "Jasper" },
    ]);
  });

  it("drops a tag whose id does not exist in the LogicStructure but keeps the inner text", () => {
    const input = "[p:phantom]Phantom[/p] was there.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Phantom was there.");
    expect(out.annotations).toEqual([]);
  });

  it("drops a person tag that points at the detective (kid is detective, no need to highlight self)", () => {
    const input = "[p:lily]Lily[/p] knelt by the hutch.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Lily knelt by the hutch.");
    expect(out.annotations).toEqual([]);
  });

  it("drops a clue tag whose id is not in essential_clues", () => {
    const input = "[c:bogus-id]thing[/c] was there.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("thing was there.");
    expect(out.annotations).toEqual([]);
  });

  it("handles tags adjacent with no surrounding whitespace", () => {
    const input = "[p:oliver]Oliver[/p][c:clover-trail]left clover[/c].";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Oliverleft clover.");
    expect(out.annotations).toEqual([
      { type: "person", id: "oliver", offset: 0, length: 6, text: "Oliver" },
      { type: "clue", id: "clover-trail", offset: 6, length: 11, text: "left clover" },
    ]);
  });

  it("handles a tag whose inner text contains regex-special characters", () => {
    const input = "Found a note: [c:grandma-note](handwritten) note about grandma.[/c] Curious.";
    const out = parseNarrativeAnnotations(input, ls());
    expect(out.text).toBe("Found a note: (handwritten) note about grandma. Curious.");
    expect(out.annotations).toEqual([
      { type: "clue", id: "grandma-note", offset: 14, length: 33, text: "(handwritten) note about grandma." },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests — they should all fail because the file doesn't exist**

```bash
pnpm --filter @mysterio/server test parseAnnotations
```
Expected: FAIL — `Cannot find module './parseAnnotations.js'` or similar.

- [ ] **Step 3: Implement `parseNarrativeAnnotations`**

Create `apps/server/src/services/generation/parseAnnotations.ts`:

```ts
import type { LogicStructure, NarrativeAnnotation } from "@mysterio/shared";
import { logger } from "../../utils/logger.js";

const TAG_RE = /\[(p|c):([^\]\s]+)\]([\s\S]+?)\[\/\1\]/g;

export function parseNarrativeAnnotations(
  rawWithTags: string,
  ls: LogicStructure,
): { text: string; annotations: NarrativeAnnotation[] } {
  // Pre-compute id lookups
  const characterIds = new Set(ls.characters.filter((c) => c.role !== "detective").map((c) => c.id));
  const clueIds = new Set(ls.essential_clues.map((c) => c.id));

  // Walk the input once, building the clean text + annotations.
  const annotations: NarrativeAnnotation[] = [];
  const cleanParts: string[] = [];
  let cleanLen = 0;
  let cursor = 0;

  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(rawWithTags); m !== null; m = TAG_RE.exec(rawWithTags)) {
    const [matched, kind, id, inner] = m;
    const matchStart = m.index;

    // Copy the text between cursor and matchStart verbatim.
    if (matchStart > cursor) {
      const segment = rawWithTags.slice(cursor, matchStart);
      cleanParts.push(segment);
      cleanLen += segment.length;
    }

    // Decide whether to keep the annotation or drop the tag (always keep inner text).
    const type: "person" | "clue" = kind === "p" ? "person" : "clue";
    const valid =
      (type === "person" && characterIds.has(id)) ||
      (type === "clue" && clueIds.has(id));

    if (valid) {
      annotations.push({ type, id, offset: cleanLen, length: inner.length, text: inner });
    } else {
      logger.info("parse_annotations_dropped_tag", { type, id, reason: "id_not_in_logic_structure" });
    }

    // Always emit the inner text into the clean output.
    cleanParts.push(inner);
    cleanLen += inner.length;
    cursor = matchStart + matched.length;
  }

  // Tail: anything after the last match.
  if (cursor < rawWithTags.length) {
    cleanParts.push(rawWithTags.slice(cursor));
  }

  return { text: cleanParts.join(""), annotations };
}
```

- [ ] **Step 4: Run the tests — they should all pass**

```bash
pnpm --filter @mysterio/server test parseAnnotations
```
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Full test sweep**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: build + typecheck clean; vitest reports 23 passed + 1 skipped (14 prior + 9 new parseAnnotations).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/parseAnnotations.ts apps/server/src/services/generation/parseAnnotations.test.ts
git commit -m "$(cat <<'EOF'
M5b.3: parseAnnotations util — strip [p:id]/[c:id] tags into clean text + annotations

Walks the narrative once, regex-matching [p|c:<id>]<inner>[/p|c]
markers. Computes offsets into the CLEAN output (post-strip) so the
frontend can render pills against the same text the kid reads. Invalid
ids (not in characters/essential_clues) are dropped silently — the
inner text always survives. Detective ids are dropped (the kid IS the
detective; no need to highlight self).

9 unit tests cover: no-tags passthrough, single person tag, single
clue tag, multi-tag offsets, invalid-id drop, detective-id drop,
adjacent tags with no separators, regex-special characters in inner
text.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.4: Narrative prompt update + narrativeAgent integration

**Files:**
- Modify: `apps/server/src/services/generation/prompts/narrative.system.ts`
- Modify: `apps/server/src/services/generation/agents/narrativeAgent.ts`

- [ ] **Step 1: Add ANNOTATION RULES to the narrative system prompt**

Modify `apps/server/src/services/generation/prompts/narrative.system.ts`. Add a new section AFTER the existing CRITICAL RULES block and BEFORE the final "If you receive a list of MISSING CLUES" instruction.

Find the line that starts with `If you receive a list of MISSING CLUES` and insert the new ANNOTATION RULES section immediately before it:

```ts
ANNOTATION RULES (very important — the frontend uses these to highlight people and clues so kids can tap them):

Wrap mentions in your prose with inline tags so the server can extract them. Two tag types:

  [p:<character-id>]Name[/p]      for a non-detective character mention
  [c:<essential-clue-id>]text[/c] for an essential-clue observation

The ids MUST match exactly the ids in the input JSON: characters[i].id for [p:…], essential_clues[i].id for [c:…].

When to wrap:
- People: wrap every named mention of a suspect, witness, or bystander character. Do NOT wrap the detective character (the kid IS the detective). To avoid visual noise, only wrap the FIRST mention of a given character within each paragraph; subsequent mentions in the same paragraph stay plain. Across paragraphs, re-wrap on the first mention again.
- Clues: wrap the first textual appearance of each essential clue. Wrap the noun phrase the kid would tap (the trail of clover sprigs, the muddy footprints, the scrap of paper) — not just the noun on its own and not the whole sentence. Wrap each essential clue at most once across the whole prose.
- Do NOT wrap false-clue mentions.
- Do NOT wrap setting/object words that are not essential clues.

Examples:
  GOOD: [p:oliver]Oliver[/p] knelt by the hutch and noticed a [c:clover-trail]trail of fresh clover sprigs[/c] leading away.
  GOOD: "She saw [p:mrs-kamble]Mrs. Kamble[/p] in the rose garden." (later paragraph) "Mrs. Kamble waved hello."  ← first mention wrapped, later mention plain
  BAD:  Oliver knelt by the hutch and saw clover.   ← people/clue unwrapped
  BAD:  [p:oliver]Oliver Smith[/p]                    ← include only the name as written, not extra text
  BAD:  [c:clover-trail]a trail[/c] of fresh [c:clover-trail]clover sprigs[/c]  ← wrap each clue ONCE, not piecewise

The wrapped text is what the kid sees and taps. The inner text must read naturally as English.

```

Then keep the existing final paragraph unchanged:
```
If you receive a list of MISSING CLUES from a previous attempt, weave each missing clue into the prose naturally — keep the rest of the story largely intact.
```

Full new file (replace entire contents):

```ts
import { difficultyConfig, type DifficultyId } from "@mysterio/shared";

export function buildNarrativeSystem(difficulty: DifficultyId): string {
  const d = difficultyConfig(difficulty);
  const minWords = Math.round(d.targetWords * (1 - d.wordToleranceFraction));
  const maxWords = Math.round(d.targetWords * (1 + d.wordToleranceFraction));
  return `You are a children's audiobook author writing a mystery story for ages 8-13.

You will receive a JSON LogicStructure for a mystery. Your job: write an engaging narration that a kid will listen to.

Output ONLY a single JSON object — no prose, no markdown:

{ "title": "<3-7 word intriguing-but-not-scary title>", "narrative_text": "<the full story prose>" }

CRITICAL RULES:
- Word count: between ${minWords} and ${maxWords} words. Stories that are too long will lose the listener.
- POV: third-person limited, following the detective character.
- Tone: warm, observant, gently curious. Spookiness only if the category warrants it; never gory.
- INCLUDE EVERY ESSENTIAL CLUE. Each essential_clues[i].description must appear in the prose, either verbatim or as a clear paraphrase using the same key nouns. False clues should appear too, but framed as plausible distractions, not as the answer.
- Do NOT name the culprit explicitly in the prose, and do NOT reveal the true_solution. The story ends BEFORE the detective announces the answer — the kid solves it themselves afterward.
- PRESERVE THE CLUE'S LEVEL OF AMBIGUITY. When weaving in a clue, keep the same level of detail the clue itself provides. If the clue says "a person carrying a bundled blue jacket through the fence", the prose says "a person carrying a bundled blue jacket through the fence" — do NOT add the suspect's name even though you know who it is. The ambiguity is what the kid deduces FROM.
- You may describe a character's traits (clothing, hobbies, where they live) in the prose, and you may have the detective notice and write things down in their notebook — but do NOT connect the observed clue to the culprit on the kid's behalf. ("Maya underlined Theo's name twice" after a clue about a blue jacket is too on-the-nose. "Maya wrote: Dandelion trail → fence gap." is fine.)
- Do NOT use the words "culprit", "essential clue", "logic chain", or refer to the JSON structure.
- Avoid real brand names, real public figures, anything that dates the story.
- Use age-appropriate vocabulary with occasional richer words for flavor.
- The detective character is the listener's stand-in — sometimes use questions ("What was that smell?") to invite the listener to think.

ANNOTATION RULES (very important — the frontend uses these to highlight people and clues so kids can tap them):

Wrap mentions in your prose with inline tags so the server can extract them. Two tag types:

  [p:<character-id>]Name[/p]      for a non-detective character mention
  [c:<essential-clue-id>]text[/c] for an essential-clue observation

The ids MUST match exactly the ids in the input JSON: characters[i].id for [p:…], essential_clues[i].id for [c:…].

When to wrap:
- People: wrap every named mention of a suspect, witness, or bystander character. Do NOT wrap the detective character (the kid IS the detective). To avoid visual noise, only wrap the FIRST mention of a given character within each paragraph; subsequent mentions in the same paragraph stay plain. Across paragraphs, re-wrap on the first mention again.
- Clues: wrap the first textual appearance of each essential clue. Wrap the noun phrase the kid would tap (the trail of clover sprigs, the muddy footprints, the scrap of paper) — not just the noun on its own and not the whole sentence. Wrap each essential clue at most once across the whole prose.
- Do NOT wrap false-clue mentions.
- Do NOT wrap setting/object words that are not essential clues.

Examples:
  GOOD: [p:oliver]Oliver[/p] knelt by the hutch and noticed a [c:clover-trail]trail of fresh clover sprigs[/c] leading away.
  GOOD: "She saw [p:mrs-kamble]Mrs. Kamble[/p] in the rose garden." (later paragraph) "Mrs. Kamble waved hello."  ← first mention wrapped, later mention plain
  BAD:  Oliver knelt by the hutch and saw clover.   ← people/clue unwrapped
  BAD:  [p:oliver]Oliver Smith[/p]                    ← include only the name as written, not extra text
  BAD:  [c:clover-trail]a trail[/c] of fresh [c:clover-trail]clover sprigs[/c]  ← wrap each clue ONCE, not piecewise

The wrapped text is what the kid sees and taps. The inner text must read naturally as English.

If you receive a list of MISSING CLUES from a previous attempt, weave each missing clue into the prose naturally — keep the rest of the story largely intact.`;
}
```

- [ ] **Step 2: Update `runNarrativeAgent` to parse tags + return annotations**

Modify `apps/server/src/services/generation/agents/narrativeAgent.ts`. The output value shape grows to include `annotations`; the text-match coverage check runs on the CLEAN (post-parse) text.

Replace the entire file with:

```ts
import {
  type DifficultyId,
  type LogicStructure,
  type NarrativeAnnotation,
} from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { parseNarrativeAnnotations } from "../parseAnnotations.js";
import { buildNarrativeSystem } from "../prompts/narrative.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";
import { findMissingClues } from "../textMatch.js";

const narrativeOutputSchema = z.object({
  title: z.string().min(3).max(120),
  narrative_text: z.string().min(200),
});

export interface NarrativeOutput {
  title: string;
  narrative_text: string;
  annotations: NarrativeAnnotation[];
}

export type NarrativeAgentResult =
  | { ok: true; value: NarrativeOutput; attemptsUsed: number; missingCluesByAttempt: string[][] }
  | { ok: false; error: string; attemptsUsed: number; missingCluesByAttempt: string[][] };

export interface NarrativeAgentInput {
  logicStructure: LogicStructure;
  difficulty: DifficultyId;
  maxAttempts: number;
}

export async function runNarrativeAgent(input: NarrativeAgentInput): Promise<NarrativeAgentResult> {
  const missingByAttempt: string[][] = [];
  let lastErr = "";

  // Strip the answer before sending to the narrative agent so it can't be lazy.
  const safeForNarrative = redactForNarrative(input.logicStructure);

  for (let attempt = 1; attempt <= input.maxAttempts; attempt++) {
    const userMsg = buildUserMessage(safeForNarrative, missingByAttempt[missingByAttempt.length - 1]);
    let raw: string;
    try {
      raw = await claudeText({
        label: `narrativeAgent:attempt${attempt}`,
        system: [
          { type: "text", text: SAFETY_PREAMBLE, cache: true },
          { type: "text", text: buildNarrativeSystem(input.difficulty) },
        ],
        user: userMsg,
        maxTokens: 4096,
        temperature: 0.85,
      });
    } catch (e) {
      lastErr = `claude call failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(extractJson(raw)); }
    catch (e) {
      lastErr = `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    const result = narrativeOutputSchema.safeParse(parsed);
    if (!result.success) {
      lastErr = `Zod failed: ${result.error.issues.map((i) => i.message).join("; ")}`;
      continue;
    }

    // Strip [p:…]/[c:…] tags from the LLM output before running the coverage check,
    // so the text-match runs against the same clean prose the kid will read.
    const { text: cleanText, annotations } = parseNarrativeAnnotations(
      result.data.narrative_text,
      input.logicStructure,
    );

    const missing = findMissingClues(input.logicStructure.essential_clues, cleanText, 0.75);
    missingByAttempt.push(missing);
    if (missing.length === 0) {
      return {
        ok: true,
        value: { title: result.data.title, narrative_text: cleanText, annotations },
        attemptsUsed: attempt,
        missingCluesByAttempt: missingByAttempt,
      };
    }
    lastErr = `narrative missing clues: ${missing.join(", ")}`;
  }
  return { ok: false, error: lastErr, attemptsUsed: input.maxAttempts, missingCluesByAttempt: missingByAttempt };
}

function buildUserMessage(safe: ReturnType<typeof redactForNarrative>, missingPrev?: string[]): string {
  const baseLines = [
    "Write the narration for this mystery. Output JSON as instructed.",
    "",
    JSON.stringify(safe, null, 2),
  ];
  if (missingPrev && missingPrev.length > 0) {
    const list = safe.essential_clues
      .filter((c) => missingPrev.includes(c.id))
      .map((c) => `- ${c.id}: ${c.description}`)
      .join("\n");
    baseLines.push("", "MISSING CLUES from your previous attempt — make sure these appear naturally in the new draft:", list);
  }
  return baseLines.join("\n");
}

function redactForNarrative(ls: LogicStructure) {
  return {
    category: ls.category,
    setting: ls.setting,
    characters: ls.characters,
    essential_clues: ls.essential_clues,
    false_clues: ls.false_clues,
    // omit true_solution and logic_chain — narrative shouldn't peek at the answer
  };
}
```

- [ ] **Step 3: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean; vitest 23 passed + 1 skipped (no new tests in this task; the parseAnnotations tests already cover the parser).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/generation/agents/narrativeAgent.ts apps/server/src/services/generation/prompts/narrative.system.ts
git commit -m "$(cat <<'EOF'
M5b.4: narrative prompt teaches [p:…]/[c:…] tagging; agent parses + returns annotations

ANNOTATION RULES section added to the narrative system prompt — wrap
people (first mention per paragraph, non-detective only) and clues
(first textual occurrence) with inline tags using exact ids from the
input LogicStructure.

runNarrativeAgent now parses the LLM's tagged output via
parseNarrativeAnnotations BEFORE the missing-clue text-match check
(the check runs on CLEAN text so tag tokens don't pollute it). Return
shape gains annotations: NarrativeAnnotation[] alongside the existing
title + narrative_text fields.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.5: Orchestrator stores annotations; mysteries GET returns them; clues POST accepts source + annotation_id with dedupe

**Files:**
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Modify: `apps/server/src/routes/mysteries.ts`
- Modify: `apps/server/src/routes/clues.ts`

- [ ] **Step 1: Orchestrator persists annotations**

Modify `apps/server/src/services/generation/orchestrator.ts`. Find the "Narrative succeeded" block (the `db.update(mysteries).set({ status: "ready", ... })` call). Add `narrative_annotations: JSON.stringify(narrativeRes.value.annotations)` to the `.set({...})` object:

```ts
    // Narrative succeeded. TTS lands in M3.4-new — for now, jump straight to "ready" with audio_path unset.
    db.update(mysteries).set({
      status: "ready",
      title: narrativeRes.value.title,
      narrative_text: narrativeRes.value.narrative_text,
      narrative_annotations: JSON.stringify(narrativeRes.value.annotations),
      ready_at: Math.floor(Date.now() / 1000),
    }).where(eq(mysteries.id, input.mysteryId)).run();
```

- [ ] **Step 2: `GET /api/mysteries/:id` returns parsed annotations**

Modify `apps/server/src/routes/mysteries.ts`. Find the GET handler that returns the mystery detail. Add `narrative_annotations` to the response object. The value is `null` for pre-M5b rows (the column is nullable). Parse the JSON-as-text:

```ts
  app.get<{ Params: { id: string } }>("/mysteries/:id", async (req, reply) => {
    const db = getDb();
    const row = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!row) {
      reply.status(404);
      return { error: "not_found" };
    }
    let characters: unknown = undefined;
    if (row.logic_structure_json) {
      try {
        const parsed = JSON.parse(row.logic_structure_json) as { characters?: unknown };
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.characters)) {
          characters = parsed.characters.map((c: Record<string, unknown>) => ({
            id: c.id, name: c.name, role: c.role, description: c.description,
          }));
        }
      } catch { /* swallow — surface as missing */ }
    }
    let narrative_annotations: unknown = null;
    if (row.status === "ready" && row.narrative_annotations) {
      try {
        narrative_annotations = JSON.parse(row.narrative_annotations);
      } catch { /* swallow — leave null so client renders plain prose */ }
    }
    return {
      id: row.id,
      player_id: row.player_id,
      category: row.category,
      difficulty: row.difficulty,
      status: row.status,
      title: row.title,
      narrative_text: row.status === "ready" ? row.narrative_text : null,
      narrative_annotations,
      audio_url: row.audio_path ? `/audio/${row.audio_path}` : null,
      characters,
      created_at: row.created_at,
      ready_at: row.ready_at,
      failure_reason: row.failure_reason,
    };
  });
```

- [ ] **Step 3: `POST /api/mysteries/:id/clues` accepts source + annotation_id with dedupe**

Modify `apps/server/src/routes/clues.ts`. The POST body schema gains two optional fields. The handler does a SELECT for `(mystery_id, annotation_id)` before INSERT — if it finds a row, returns 200 with the existing clue. Replace the file with:

```ts
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { clues } from "../db/schema.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  category_type: z.enum(["character", "item", "location", "event", "note"]),
  content: z.string().min(1).max(500),
  audio_timestamp_ms: z.number().int().nonnegative().optional(),
  source: z.enum(["manual", "annotation"]).optional(),
  annotation_id: z.string().min(1).max(120).optional(),
}).refine(
  (b) => !(b.source === "annotation") || (typeof b.annotation_id === "string"),
  { message: "annotation_id required when source is 'annotation'" },
);

const patchBody = z.object({
  content: z.string().min(1).max(500),
});

export async function cluesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/clues", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const source = parsed.data.source ?? "manual";
    const annotation_id = parsed.data.annotation_id ?? null;

    // Dedupe annotation-sourced clues by (mystery_id, annotation_id) so re-taps return the existing row.
    if (source === "annotation" && annotation_id) {
      const existing = db.select().from(clues)
        .where(and(eq(clues.mystery_id, req.params.id), eq(clues.annotation_id, annotation_id)))
        .get();
      if (existing) {
        reply.status(200);
        return { clue: existing };
      }
    }

    const id = shortId();
    db.insert(clues).values({
      id,
      mystery_id: req.params.id,
      category_type: parsed.data.category_type,
      content: parsed.data.content,
      audio_timestamp_ms: parsed.data.audio_timestamp_ms ?? null,
      source,
      annotation_id,
    }).run();
    reply.status(201);
    const row = db.select().from(clues).where(eq(clues.id, id)).get();
    return { clue: row };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/clues", async (req) => {
    const db = getDb();
    const rows = db.select().from(clues).where(eq(clues.mystery_id, req.params.id)).all();
    return { clues: rows };
  });

  app.patch<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const where = and(eq(clues.id, req.params.clueId), eq(clues.mystery_id, req.params.id));
    db.update(clues).set({ content: parsed.data.content }).where(where).run();
    const row = db.select().from(clues).where(where).get();
    if (!row) { reply.status(404); return { error: "not_found" }; }
    return { clue: row };
  });

  app.delete<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const db = getDb();
    db.delete(clues).where(and(eq(clues.id, req.params.clueId), eq(clues.mystery_id, req.params.id))).run();
    reply.status(204);
  });
}
```

- [ ] **Step 4: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean; 23 passed + 1 skipped.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "$(cat <<'EOF'
M5b.5: orchestrator persists annotations; mysteries GET returns them; clues POST dedupes annotation source

- orchestrator: writes JSON.stringify(annotations) into mysteries.narrative_annotations on "ready"
- GET /mysteries/:id: parses narrative_annotations from DB and returns it on ready rows; null otherwise
- POST /mysteries/:id/clues: body schema gains optional source + annotation_id; if source="annotation" and a row already exists for (mystery_id, annotation_id), returns 200 with the existing clue instead of 201 (re-taps are idempotent)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.6: AnnotatedNarrative component

**Files:**
- Create: `apps/web/src/screens/PlaybackScreen/AnnotatedNarrative/AnnotatedNarrative.tsx`
- Modify: `apps/web/src/api/mysteries.ts`
- Modify: `apps/web/src/api/clues.ts`

- [ ] **Step 1: Add `narrative_annotations` to web `MysteryDetail`**

Modify `apps/web/src/api/mysteries.ts`. Add the `NarrativeAnnotation` import + the new field:

```ts
import type { CategoryId, DifficultyId, MysterySummary, MysteryStatus, NarrativeAnnotation } from "@mysterio/shared";
import { api } from "./client.js";

export interface MysteryDetail {
  id: string;
  player_id: string;
  category: CategoryId;
  difficulty: DifficultyId;
  status: MysteryStatus;
  title: string | null;
  narrative_text: string | null;
  narrative_annotations: NarrativeAnnotation[] | null;
  audio_url: string | null;
  characters?: PublicCharacter[];
  created_at: number;
  ready_at: number | null;
  failure_reason: string | null;
}

export interface PublicCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
}

// ... rest of file unchanged (generateMystery, getMystery, listMysteries) ...
```

(Keep the existing exported functions verbatim; just add the import + field.)

- [ ] **Step 2: Add source + annotation_id to the clues API client**

Modify `apps/web/src/api/clues.ts`. The `createClue` body type gains the two new optional fields:

```ts
import type { Clue, ClueCategoryType } from "@mysterio/shared";
import { api } from "./client.js";

export function listClues(mysteryId: string): Promise<{ clues: Clue[] }> {
  return api(`/api/mysteries/${mysteryId}/clues`);
}

export function createClue(
  mysteryId: string,
  body: {
    category_type: ClueCategoryType;
    content: string;
    source?: "manual" | "annotation";
    annotation_id?: string;
  },
): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues`, { method: "POST", body: JSON.stringify(body) });
}

export function updateClue(mysteryId: string, clueId: string, content: string): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}`, { method: "PATCH", body: JSON.stringify({ content }) });
}

export function deleteClue(mysteryId: string, clueId: string): Promise<void> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}`, { method: "DELETE" });
}
```

- [ ] **Step 3: AnnotatedNarrative component**

Create `apps/web/src/screens/PlaybackScreen/AnnotatedNarrative/AnnotatedNarrative.tsx`:

```tsx
import type { NarrativeAnnotation, PublicCharacter } from "@mysterio/shared";

const PERSON_ROLE_COLOR: Record<string, string> = {
  suspect: "#ff8c8c",
  witness: "#9ad4ff",
  bystander: "var(--text-dim)",
};

const PERSON_ROLE_BG: Record<string, string> = {
  suspect: "rgba(255,140,140,0.18)",
  witness: "rgba(154,212,255,0.18)",
  bystander: "rgba(185,179,214,0.15)",
};

const CLUE_COLOR = "#f5c84c";
const CLUE_BG = "rgba(245,200,76,0.20)";

export function AnnotatedNarrative({
  text,
  annotations,
  characters,
  onTap,
}: {
  text: string;
  annotations: NarrativeAnnotation[];
  characters: PublicCharacter[];
  onTap: (annotation: NarrativeAnnotation) => void;
}) {
  // Sort by offset so we can splice the text in order.
  const sorted = [...annotations].sort((a, b) => a.offset - b.offset);

  const charById = new Map<string, PublicCharacter>();
  for (const c of characters) charById.set(c.id, c);

  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < sorted.length; i++) {
    const ann = sorted[i];
    // Skip annotations that would overlap with the previous one — defense against parser oddities.
    if (ann.offset < cursor) continue;
    // Plain text between cursor and this annotation
    if (ann.offset > cursor) {
      pieces.push(text.slice(cursor, ann.offset));
    }
    pieces.push(
      <AnnotatedSpan
        key={`${ann.type}-${ann.id}-${ann.offset}`}
        annotation={ann}
        characters={charById}
        onTap={onTap}
      />
    );
    cursor = ann.offset + ann.length;
  }
  if (cursor < text.length) {
    pieces.push(text.slice(cursor));
  }

  return (
    <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 16 }}>
      {pieces}
    </div>
  );
}

function AnnotatedSpan({
  annotation,
  characters,
  onTap,
}: {
  annotation: NarrativeAnnotation;
  characters: Map<string, PublicCharacter>;
  onTap: (a: NarrativeAnnotation) => void;
}) {
  const inner = annotation.text;
  let color = CLUE_COLOR;
  let bg = CLUE_BG;
  let aria = `Clue: ${inner}`;
  if (annotation.type === "person") {
    const c = characters.get(annotation.id);
    const role = c?.role ?? "bystander";
    color = PERSON_ROLE_COLOR[role] ?? PERSON_ROLE_COLOR.bystander;
    bg = PERSON_ROLE_BG[role] ?? PERSON_ROLE_BG.bystander;
    aria = `${role.charAt(0).toUpperCase() + role.slice(1)}: ${inner}`;
  }
  return (
    <button
      onClick={() => onTap(annotation)}
      aria-label={aria}
      style={{
        background: bg,
        color,
        padding: "1px 8px",
        borderRadius: 10,
        border: "none",
        font: "inherit",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline",
      }}
    >
      {inner}
    </button>
  );
}
```

- [ ] **Step 4: Build + typecheck**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M5b.6: AnnotatedNarrative component + web API surface for source/annotation_id

AnnotatedNarrative walks the prose using sorted annotation offsets,
emitting plain-text spans between annotated <button> pills. Person
pills are color-coded by role (red suspect, blue witness, grey
bystander); clue pills are gold. Each pill calls onTap(annotation)
which the parent wires to auto-add a clue.

MysteryDetail gains narrative_annotations: NarrativeAnnotation[] | null.
createClue() body type gains source + annotation_id (optional).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.7: ClueTracker focused-mode + ClueEditor auto-added badge

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueTracker.tsx`
- Modify: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueEditor.tsx`

- [ ] **Step 1: ClueEditor shows a ✨ "auto-added" badge for annotation-sourced rows**

Modify `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueEditor.tsx`. The component receives `clue: Clue` which now includes `source` and `annotation_id`. Add a small badge next to the content for `source === "annotation"`. The full replacement:

```tsx
import { useEffect, useState } from "react";
import type { Clue } from "@mysterio/shared";

export function ClueEditor({
  clue,
  focused,
  onSave,
  onDelete,
}: {
  clue: Clue;
  focused?: boolean;
  onSave: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clue.content);

  useEffect(() => {
    if (!editing) setDraft(clue.content);
  }, [clue.content, editing]);

  const isAuto = clue.source === "annotation";

  const wrapperStyle: React.CSSProperties = {
    display: "flex",
    gap: 6,
    alignItems: "center",
    padding: 8,
    background: "var(--surface-2)",
    borderRadius: 8,
    border: focused ? "2px solid var(--accent)" : "2px solid transparent",
    transition: "border-color 120ms ease",
  };

  if (editing) {
    return (
      <div style={wrapperStyle}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--surface)", background: "var(--bg)", color: "var(--text)", fontSize: 16 }}
        />
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#1a1530", fontWeight: 600, cursor: "pointer" }}
        >Save</button>
        <button
          onClick={() => { setDraft(clue.content); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
        >Cancel</button>
      </div>
    );
  }
  return (
    <div style={wrapperStyle}>
      {isAuto && (
        <span
          title="Added by tapping a highlight in the story"
          style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}
        >✨</span>
      )}
      <span style={{ flex: 1 }}>{clue.content}</span>
      <button
        onClick={() => setEditing(true)}
        style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", fontSize: 13, cursor: "pointer" }}
      >Edit</button>
      <button
        onClick={onDelete}
        style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--bad)", fontSize: 13, cursor: "pointer" }}
        aria-label="Delete clue"
      >×</button>
    </div>
  );
}
```

- [ ] **Step 2: ClueTracker supports focused mode**

Modify `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueTracker.tsx`. Add a `focusedClueId?: string | null` prop, an `onClearFocus` callback, and behavior so that whenever `focusedClueId` becomes non-null the drawer opens, switches to the matching tab, and scrolls the focused row into view.

Full replacement of the file:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Clue, ClueCategoryType } from "@mysterio/shared";
import { createClue, deleteClue, listClues, updateClue } from "../../../api/clues.js";
import { Button } from "../../../components/Button.js";
import { ClueCategoryTabs } from "./ClueCategoryTabs.js";
import { ClueEditor } from "./ClueEditor.js";

export function ClueTracker({
  mysteryId,
  focusedClueId,
  onClearFocus,
}: {
  mysteryId: string;
  focusedClueId?: string | null;
  onClearFocus?: () => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ClueCategoryType>("character");
  const [draft, setDraft] = useState("");
  const focusedRowRef = useRef<HTMLDivElement | null>(null);

  const cluesQ = useQuery({ queryKey: ["clues", mysteryId], queryFn: () => listClues(mysteryId) });

  const allClues = cluesQ.data?.clues ?? [];
  const focusedClue = focusedClueId ? allClues.find((c) => c.id === focusedClueId) : undefined;

  // When focusedClueId changes, expand the drawer and switch to that clue's tab.
  useEffect(() => {
    if (focusedClueId && focusedClue) {
      setExpanded(true);
      setActiveTab(focusedClue.category_type);
    }
  }, [focusedClueId, focusedClue]);

  // Scroll the focused row into view once the tab matches.
  useEffect(() => {
    if (focusedClueId && expanded && focusedRowRef.current) {
      focusedRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedClueId, expanded, activeTab]);

  const createM = useMutation({
    mutationFn: () => createClue(mysteryId, { category_type: activeTab, content: draft.trim() }),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["clues", mysteryId] }); },
  });
  const updateM = useMutation({
    mutationFn: ({ clueId, content }: { clueId: string; content: string }) => updateClue(mysteryId, clueId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId] }),
  });
  const deleteM = useMutation({
    mutationFn: (clueId: string) => deleteClue(mysteryId, clueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId] }),
  });

  const visible = allClues.filter((c) => c.category_type === activeTab);

  function closeDrawer() {
    setExpanded(false);
    if (onClearFocus) onClearFocus();
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 20px",
          background: "var(--surface)",
          border: "none",
          borderTop: "2px solid var(--accent)",
          color: "var(--text)",
          fontSize: 15,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          zIndex: 5,
        }}
        aria-label="Open clue tracker"
      >
        <span>
          📝 Clue Tracker{" "}
          <span style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 13 }}>
            — {allClues.length} {allClues.length === 1 ? "clue" : "clues"}
          </span>
        </span>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>▲ Tap to open</span>
      </button>
    );
  }

  return (
    <>
      <div
        onClick={closeDrawer}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10 }}
        aria-hidden="true"
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--surface)",
          borderRadius: "16px 16px 0 0",
          padding: 16,
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 11,
        }}
        role="dialog"
        aria-label="Clue tracker"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Clue Tracker</h3>
          <button
            onClick={closeDrawer}
            style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 24, cursor: "pointer", padding: 4 }}
            aria-label="Close clue tracker"
          >▼</button>
        </div>
        <ClueCategoryTabs active={activeTab} onChange={setActiveTab} />
        <div style={{ display: "grid", gap: 6, overflowY: "auto", flex: 1, marginBottom: 8 }}>
          {visible.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>{emptyCopy(activeTab)}</p>
          )}
          {visible.map((c) => {
            const isFocused = c.id === focusedClueId;
            return (
              <div key={c.id} ref={isFocused ? focusedRowRef : undefined}>
                <ClueEditor
                  clue={c}
                  focused={isFocused}
                  onSave={(content) => updateM.mutate({ clueId: c.id, content })}
                  onDelete={() => deleteM.mutate(c.id)}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a clue..."
            style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid var(--surface-2)", background: "var(--bg)", color: "var(--text)", fontSize: 16 }}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim() && !createM.isPending) createM.mutate(); }}
          />
          <Button disabled={!draft.trim() || createM.isPending} onClick={() => createM.mutate()}>Add</Button>
        </div>
      </div>
    </>
  );
}

function emptyCopy(tab: ClueCategoryType): string {
  switch (tab) {
    case "character": return "Heard about a suspicious character? Add them here.";
    case "item": return "Notice an interesting object? Write it down.";
    case "location": return "A surprising place? Add it here.";
    case "event": return "Something that happened that doesn't add up?";
    case "note": return "Anything else you want to remember.";
  }
}
```

- [ ] **Step 3: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M5b.7: ClueTracker focused-mode + ClueEditor ✨ auto-added badge

ClueTracker.tsx gains focusedClueId + onClearFocus props. When
focusedClueId is set: drawer auto-expands, switches to the matching
category tab, and scrolls the focused row into view. Closing the
drawer (backdrop tap, chevron) also clears focus.

ClueEditor.tsx renders a ✨ prefix on rows where source === "annotation"
and outlines the row with var(--accent) when focused. Tooltip on the
sparkle explains "Added by tapping a highlight in the story".

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.8: PlaybackScreen wires AnnotatedNarrative + focused-state to ClueTracker

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`

- [ ] **Step 1: Wire it all together**

Modify `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`. Replace the file with:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { NarrativeAnnotation } from "@mysterio/shared";
import { createClue } from "../../api/clues.js";
import { Button } from "../../components/Button.js";
import { useGenerationJob } from "../../hooks/useGenerationJob.js";
import { AnnotatedNarrative } from "./AnnotatedNarrative/AnnotatedNarrative.js";
import { BriefingCard } from "./BriefingCard/BriefingCard.js";
import { ClueTracker } from "./ClueTracker/ClueTracker.js";
import { FailedMystery } from "./FailedMystery.js";
import { LoadingMystery } from "./LoadingMystery.js";

export function PlaybackScreen() {
  const { id } = useParams<{ id: string }>();
  const mysteryId = id!;
  const { data, isLoading, isError } = useGenerationJob(mysteryId);
  const [started, setStarted] = useState(false);
  const [focusedClueId, setFocusedClueId] = useState<string | null>(null);
  const qc = useQueryClient();

  const tapAnnotation = useMutation({
    mutationFn: (a: NarrativeAnnotation) => {
      // For person annotations, look up the character to get a kid-readable content snippet.
      // For clue annotations, use the parser-emitted text (matches what the kid tapped).
      const character = data?.characters?.find((c) => c.id === a.id);
      const content =
        a.type === "person"
          ? character
            ? `${character.name} — ${character.role}: ${character.description}`
            : a.text
          : a.text;
      const category_type = a.type === "person" ? "character" : guessClueCategory(a, data);
      const annotation_id = `${a.type === "person" ? "p" : "c"}-${a.id}`;
      return createClue(mysteryId, {
        category_type,
        content,
        source: "annotation",
        annotation_id,
      });
    },
    onSuccess: (res) => {
      setFocusedClueId(res.clue.id);
      qc.invalidateQueries({ queryKey: ["clues", mysteryId] });
    },
  });

  if (isLoading || !data) return <LoadingMystery status="pending" />;
  if (isError) return <FailedMystery reason={null} />;
  if (data.status === "failed") return <FailedMystery reason={data.failure_reason} />;
  if (data.status !== "ready") return <LoadingMystery status={data.status} />;

  if (!started) {
    return <BriefingCard mystery={data} onStart={() => setStarted(true)} />;
  }

  const text = data.narrative_text ?? "";
  const annotations = data.narrative_annotations ?? [];
  const characters = data.characters ?? [];

  return (
    <>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", paddingBottom: 80 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back</Link>
          <Link to={`/mysteries/${mysteryId}/solve`}><Button>I think I know!</Button></Link>
        </header>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{data.title}</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
          Tap a highlighted name or clue to add it to your notes.
        </p>
        <AnnotatedNarrative
          text={text}
          annotations={annotations}
          characters={characters}
          onTap={(a) => tapAnnotation.mutate(a)}
        />
      </div>
      <ClueTracker
        mysteryId={mysteryId}
        focusedClueId={focusedClueId}
        onClearFocus={() => setFocusedClueId(null)}
      />
    </>
  );
}

function guessClueCategory(
  annotation: NarrativeAnnotation,
  mystery: { logic_structure_json?: string | null } & { [k: string]: unknown },
): "item" | "location" | "event" | "note" {
  // The mystery DTO doesn't include essential_clues (those are inside logic_structure_json
  // which the server intentionally doesn't expose to the client). Annotations only carry
  // type + id, so for clue annotations we default to "note". The kid can re-categorise
  // later via the existing ClueTracker tabs. This is acceptable for MVP — refining the
  // server's GET to also return public-essential-clue metadata is a v2 polish item.
  void annotation;
  void mystery;
  return "note";
}
```

- [ ] **Step 2: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M5b.8: PlaybackScreen wires AnnotatedNarrative + tap-add-to-notes flow

After the kid taps Start on the briefing, PlaybackScreen renders the
AnnotatedNarrative (pill highlights) instead of the plain prose div.
Tapping a pill fires createClue with source="annotation" and
annotation_id="<p|c>-<id>"; on success the returned clue id is set
as focusedClueId, which opens the ClueTracker drawer focused on that
row. Person annotations route to the "character" tab with a name +
role + description content snippet; clue annotations land in "note"
(refining the server GET to expose public-essential-clue metadata is
a v2 polish item — kids can re-categorise via the tabs).

Header copy changed to "Tap a highlighted name or clue to add it to
your notes." so the kid knows what to do.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5b.9: Live LLM verification (2 fresh generations + tap-add flow)

**Files:** none (verification only)

- [ ] **Step 1: Build everything + boot the local server**

```bash
pnpm --filter @mysterio/shared build > /tmp/build.log 2>&1
pnpm --filter @mysterio/server build >> /tmp/build.log 2>&1
pnpm --filter @mysterio/web build >> /tmp/build.log 2>&1 && echo "BUILDS OK"
(cd apps/server && node --env-file=.env dist/src/index.js > /tmp/m5b.srv.log 2>&1 &)
sleep 3
curl -sS http://localhost:3000/api/health
```
Expected: `BUILDS OK` and `{"ok":true,"db":true}`.

- [ ] **Step 2: Generate two fresh mysteries**

```bash
MID1=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"missing-pet","difficulty":"easy"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['mystery_id'])")
MID2=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p2","category":"locked-room","difficulty":"easy"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['mystery_id'])")
echo "MID1=$MID1  MID2=$MID2"
echo "$MID1" > /tmp/m5b.mid1
echo "$MID2" > /tmp/m5b.mid2

for i in $(seq 1 36); do
  S1=$(curl -sS "http://localhost:3000/api/mysteries/$MID1" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  S2=$(curl -sS "http://localhost:3000/api/mysteries/$MID2" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  printf "[%2d] m1=%s m2=%s\n" "$i" "$S1" "$S2"
  if [[ "$S1" == "ready" || "$S1" == "failed" ]] && [[ "$S2" == "ready" || "$S2" == "failed" ]]; then break; fi
  sleep 5
done
```
Expected: both flip to `ready` within 60-150s. If one flips to `failed` with `narrative_clue_coverage`, regenerate that one — it's a known M3.1 stochastic issue, not an M5b regression.

- [ ] **Step 3: Verify annotations are populated in DB**

```bash
MID1=$(cat /tmp/m5b.mid1)
python3 <<EOF
import sqlite3, json
con = sqlite3.connect("data/mysterio.db")
row = con.execute("SELECT narrative_text, narrative_annotations FROM mysteries WHERE id=?", ("$MID1",)).fetchone()
anns = json.loads(row[1]) if row[1] else []
print(f"narrative length: {len(row[0])} chars")
print(f"annotations count: {len(anns)}")
print(f"types: {sorted(set(a['type'] for a in anns))}")
person_ids = sorted(set(a['id'] for a in anns if a['type'] == 'person'))
clue_ids = sorted(set(a['id'] for a in anns if a['type'] == 'clue'))
print(f"person ids: {person_ids}")
print(f"clue ids: {clue_ids}")
print()
print("First 6 annotations (offset/length/text):")
for a in anns[:6]:
    snippet = row[0][a['offset']:a['offset']+a['length']]
    match = "✓" if snippet == a['text'] else "✗"
    print(f"  {match} [{a['type']}:{a['id']}] {a['text']!r} at offset {a['offset']} (extracted: {snippet!r})")
EOF
```
Expected: `annotations count > 0`, types includes both `person` and `clue`, and the first 6 annotations show `✓` (extracted text matches stored text at the recorded offset).

- [ ] **Step 4: Verify the GET API returns annotations**

```bash
MID1=$(cat /tmp/m5b.mid1)
curl -sS "http://localhost:3000/api/mysteries/$MID1" | python3 -c "
import json, sys
d = json.load(sys.stdin)
anns = d.get('narrative_annotations') or []
print(f'narrative_annotations field present: {anns is not None}')
print(f'count: {len(anns)}')
if anns: print(f'sample: {anns[0]}')
"
```
Expected: `narrative_annotations field present: True`, count > 0, sample shows the `{type, id, offset, length, text}` shape.

- [ ] **Step 5: Verify the tap-add flow via curl**

```bash
MID1=$(cat /tmp/m5b.mid1)
# Pick the first person annotation; simulate a tap
ANN=$(curl -sS "http://localhost:3000/api/mysteries/$MID1" | python3 -c "
import json,sys
anns = (json.load(sys.stdin).get('narrative_annotations') or [])
p = next((a for a in anns if a['type'] == 'person'), None)
print(json.dumps(p))
")
echo "tapping: $ANN"
CONTENT=$(echo "$ANN" | python3 -c "import json,sys; a=json.load(sys.stdin); print(a['text'] + ' (auto-added from story)')")
PID=$(echo "$ANN" | python3 -c "import json,sys; a=json.load(sys.stdin); print('p-' + a['id'])")
echo "annotation_id: $PID"

echo "--- 1st tap (expect 201) ---"
curl -sS -w "\nstatus=%{http_code}\n" -X POST "http://localhost:3000/api/mysteries/$MID1/clues" \
  -H 'Content-Type: application/json' \
  -d "{\"category_type\":\"character\",\"content\":\"$CONTENT\",\"source\":\"annotation\",\"annotation_id\":\"$PID\"}"

echo "--- 2nd tap of same annotation (expect 200 dedupe — same clue id returned) ---"
curl -sS -w "\nstatus=%{http_code}\n" -X POST "http://localhost:3000/api/mysteries/$MID1/clues" \
  -H 'Content-Type: application/json' \
  -d "{\"category_type\":\"character\",\"content\":\"$CONTENT\",\"source\":\"annotation\",\"annotation_id\":\"$PID\"}"

echo "--- GET clues (expect 1 row for this annotation_id, with source=annotation) ---"
curl -sS "http://localhost:3000/api/mysteries/$MID1/clues" | python3 -c "
import json, sys
rows = json.load(sys.stdin)['clues']
matched = [c for c in rows if c.get('annotation_id') == '$PID']
print(f'matched rows: {len(matched)}')
for r in matched: print(f'  source={r.get(\"source\")} id={r[\"id\"]} content={r[\"content\"][:80]}')
"
```
Expected: 1st POST returns 201 + a new clue. 2nd POST returns 200 with the SAME clue (dedupe). GET shows exactly 1 row with `source=annotation` for that annotation_id.

- [ ] **Step 6: Browser smoke (Playwright) on the local stack**

Boot Vite in the background, navigate to one of the ready mysteries, hit Start, tap a pill, confirm the drawer opens focused. (If the controller can't run Playwright, the user will validate visually in M5b.10's iPad walkthrough.) Pseudocode:

```bash
(cd apps/web && npx vite --host 127.0.0.1 --port 5173 > /tmp/m5b.vite.log 2>&1 &)
sleep 4
# Then in a separate Playwright session:
# - navigate to http://127.0.0.1:5173/mysteries/$MID1
# - if needed set localStorage 'mysterio.activePlayer' to {"state":{"activePlayerId":"p1"}, "version":0}
# - click "📖 Start the story"
# - confirm pill <button>s render in the prose (count > 0)
# - click one pill → confirm ClueTracker drawer expands with a focused row visible
# - click backdrop → confirm drawer collapses + focus clears
# - click the same pill again → drawer reopens focused on the SAME existing row (no duplicate)
```

If anything is off, surface as DONE_WITH_CONCERNS so the controller can iterate.

- [ ] **Step 7: Stop local servers**

```bash
pkill -f "node --env-file=.env dist/src/index.js" 2>/dev/null
pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null
sleep 1
```

---

## Task M5b.10: Deploy to panther-golem.exe.xyz + iPad smoke handoff

**Files:** none (deploy + handoff)

- [ ] **Step 1: Deploy**

```bash
bash scripts/deploy.sh
```
Expected: build → rsync → install → **migrate** → restart → health passes. The remote `db:migrate` step will apply the new `0001_*.sql` migration; verify it ran by spot-checking the remote schema:

```bash
ssh panther-golem.exe.xyz "sqlite3 ~/mysterio/data/mysterio.db '.schema clues' | grep -E 'source|annotation_id'"
```
Expected: both new columns appear.

- [ ] **Step 2: Remote spot-check (generate + verify annotations + tap-dedupe)**

```bash
MID=$(curl -sS -X POST https://panther-golem.exe.xyz/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"missing-pet","difficulty":"easy"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['mystery_id'])")
echo "$MID"
for i in $(seq 1 36); do
  STATUS=$(curl -sS "https://panther-golem.exe.xyz/api/mysteries/$MID" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  printf "[%2d] %s\n" "$i" "$STATUS"
  if [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 5
done
curl -sS "https://panther-golem.exe.xyz/api/mysteries/$MID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
anns = d.get('narrative_annotations') or []
print(f'annotations: {len(anns)} ({sorted(set(a[\"type\"] for a in anns))})')
"
```
Expected: status ready, annotations non-empty with both `person` and `clue` types.

- [ ] **Step 3: iPad handoff checklist**

```
Live at https://panther-golem.exe.xyz/

iPad walkthrough (M5b):
1. Pick player P1 or P2.
2. Generate a fresh Easy missing-pet mystery, wait ~90s for ready.
3. On the BriefingCard, tap "📖 Start the story".
4. Confirm the narrative prose now has colored pill highlights:
   - 🤔 suspects in red
   - 👀 witnesses in blue
   - 🧍 bystanders in grey
   - 🔍 clues in gold
5. Tap a SUSPECT pill (e.g. "Oliver"):
   - ClueTracker drawer should slide up
   - Switch to the "Characters" tab
   - The row for Oliver should have a ✨ sparkle + a yellow outline (focused)
   - The row content should include the character's role + description
6. Edit the row to add your own note ("I think he did it"). Save.
7. Tap the SAME suspect pill again:
   - Drawer reopens focused on the same row — NO duplicate row
   - Your edit is preserved
8. Tap a CLUE pill (e.g. "trail of clover sprigs"):
   - Drawer should switch to the "Notes" tab and focus a new ✨ row with the clue text
9. Tap the backdrop → drawer collapses, focus clears.
10. Tap "I think I know!" → SolutionScreen still works end-to-end with the tracked notes flowing through.

If anything is off, report back and we'll iterate.
```

- [ ] **Step 4: Mark M5b complete**

If smoke passes: M5b shipped, queue audio (M3.3-new) as the next user-pivoted milestone.

If smoke flags issues: surface them; the most likely tuning items are (a) LLM forgets to wrap a clue → kid loses a highlight (fix via prompt tightening or a second-pass coverage check), (b) pill density too high on some paragraphs (cap wraps per paragraph in the prompt), (c) the "Notes" default tab for clue annotations feels wrong → expose essential_clues metadata on the mystery GET so we can use the LS's `category_type`.

---

## Self-Review

Checked against `docs/superpowers/specs/2026-05-17-m5-kid-onboarding-design.md` § M5b:

| Spec section | Implementation |
|---|---|
| §M5b.1 Inline-delimiter narrative output | Task M5b.4 (prompt + agent integration) |
| §M5b.2 Server-side parser | Task M5b.3 (`parseAnnotations.ts` + 9 tests) |
| §M5b.3 Storage (mysteries.narrative_annotations + clues.source/annotation_id + unique partial index) | Task M5b.1 (migration) |
| §M5b.3 Shared types | Task M5b.2 |
| §M5b.4 Frontend rendering (AnnotatedNarrative) | Task M5b.6 |
| §M5b.4 ClueTracker focused-mode + auto-added visual | Task M5b.7 |
| §M5b.4 PlaybackScreen wires it all | Task M5b.8 |
| §M5b.5 API change (POST clues accepts source + annotation_id; dedupe on (mystery_id, annotation_id)) | Task M5b.5 |
| Acceptance: tap → drawer opens focused, re-tap returns same row | Task M5b.9 step 5 |
| Acceptance: deployed + iPad smoke | Task M5b.10 |

Plan failures scan (per writing-plans skill):
- No "TBD" / "implement later" / "appropriate error handling" / "similar to Task N".
- All endpoints, types, functions, and imports are defined in earlier tasks before being referenced.
- Method names consistent: `parseNarrativeAnnotations`, `createClue`, `runNarrativeAgent`, `runGeneration`. Component names consistent: `AnnotatedNarrative`, `ClueTracker`, `ClueEditor`, `BriefingCard`.
- `.js` import extensions throughout (project ESM convention).
- Commit-message Co-Authored-By trailer is `Claude Sonnet 4.6` (matches repo's existing history).
- Migration: drizzle-kit will produce the file name from the schema diff — the plan acknowledges the random suffix.
- Subtle dependency: M5b.8's `guessClueCategory` documents that the server doesn't currently expose essential_clues metadata — explicit MVP fallback to "note", v2 polish item.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-m5b-implementation.md`. Subagent-driven execution with sonnet (per `workflow_subagent_driven` + `workflow_model_selection`). 10 tasks: M5b.1-M5b.8 implementation, M5b.9 live verification, M5b.10 deploy + iPad handoff. **Do NOT begin until M5a iPad walkthrough is signed off** (it was — user confirmed 2026-05-17 with "let's go for m5b").
