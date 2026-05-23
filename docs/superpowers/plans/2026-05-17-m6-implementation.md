# M6 Implementation Plan — reduce info leakage + multi-choice solve

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Highlight false clues alongside essentials so the kid can't tell which is which by pill formatting. (2) Collapse witness/suspect/bystander into one undifferentiated set on the client (server keeps roles internally for narrative coherence). (3) Replace free-text HOW/WHY inputs with multiple-choice option pickers; LogicStructure agent generates the 3 distractors per field up-front; server === compares instead of calling the LLM grader.

**Architecture:** Backend changes: LogicStructure schema + prompt grows distractor fields; parser allows false-clue ids; new GET /solve-options endpoint shuffles options server-side; submit-solution drops runGrader calls. Frontend changes: collapse role visuals in BriefingCard/AnnotatedNarrative/CharacterPicker; GuessForm switches HOW/WHY to picker components.

**Tech Stack:** Fastify 5, Drizzle (better-sqlite3), Anthropic SDK 0.96.0, Zod 3, React 18 + Vite, TanStack Query 5, vitest.

**Source spec:** `docs/superpowers/specs/2026-05-17-m6-reduce-info-leakage-design.md` (approved 2026-05-17).

**Continue using:** sonnet for implementer + reviewer subagents (per `workflow_model_selection` memory); per-task review pattern of implementer → spec compliance → code quality → fix → re-review (per `workflow_subagent_driven` memory).

---

## Task M6.1: parseAnnotations accepts false-clue ids

**Files:**
- Modify: `apps/server/src/services/generation/parseAnnotations.ts`
- Modify: `apps/server/src/services/generation/parseAnnotations.test.ts`

- [ ] **Step 1: Update the valid clue-id set in the parser**

In `apps/server/src/services/generation/parseAnnotations.ts`, replace:

```ts
const clueIds = new Set(ls.essential_clues.map((c) => c.id));
```

with:

```ts
const clueIds = new Set([...ls.essential_clues, ...ls.false_clues].map((c) => c.id));
```

No other changes to the file.

- [ ] **Step 2: Update the existing "drops invalid clue id" test**

In `apps/server/src/services/generation/parseAnnotations.test.ts`, the existing test is:

```ts
it("drops a clue tag whose id is not in essential_clues", () => {
  const input = "[c:bogus-id]thing[/c] was there.";
  const out = parseNarrativeAnnotations(input, ls());
  expect(out.text).toBe("thing was there.");
  expect(out.annotations).toEqual([]);
});
```

Change the description so it still reads accurately (false clues are now valid):

```ts
it("drops a clue tag whose id is not in essential_clues OR false_clues", () => {
  const input = "[c:bogus-id]thing[/c] was there.";
  const out = parseNarrativeAnnotations(input, ls());
  expect(out.text).toBe("thing was there.");
  expect(out.annotations).toEqual([]);
});
```

- [ ] **Step 3: Add a new test that confirms false clues now pass through**

In the same test file, the `ls()` helper currently sets `false_clues: []`. Update the factory to include a false clue, then add a new test. The updated `ls()`:

```ts
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
    false_clues: [
      { id: "muddy-footprints", description: "Muddy footprints near the gate (Jasper's morning run distractor)." },
    ],
    true_solution: { who_did_it: "oliver", how: "x", why: "y" },
    logic_chain: ["a", "b", "c"],
    how_distractors: ["aa", "bb", "cc"],
    why_distractors: ["xx", "yy", "zz"],
  } as LogicStructure;
}
```

(The added `how_distractors` and `why_distractors` are added preemptively for M6.4 — the type cast `as LogicStructure` already keeps the test file compiling even if M6.4 hasn't landed yet.)

Add this test:

```ts
it("keeps a clue tag pointing at a false_clue id (M6: false clues are highlighted too)", () => {
  const input = "She noticed [c:muddy-footprints]muddy footprints near the gate[/c].";
  const out = parseNarrativeAnnotations(input, ls());
  expect(out.text).toBe("She noticed muddy footprints near the gate.");
  expect(out.annotations).toEqual([
    { type: "clue", id: "muddy-footprints", offset: 12, length: 30, text: "muddy footprints near the gate" },
  ]);
});
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @mysterio/server test parseAnnotations
```
Expected: 10 passed (9 existing + 1 new). If any of the existing tests broke because the `ls()` factory now includes a false clue, fix the test expectations.

- [ ] **Step 5: Full test sweep**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean; 24 passed + 1 skipped (23 prior + 1 new).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/parseAnnotations.ts apps/server/src/services/generation/parseAnnotations.test.ts
git commit -m "$(cat <<'EOF'
M6.1: parseAnnotations accepts false-clue ids — kid can't tell essential from false by pill formatting

Per design spec: false clues must be highlighted alongside essential
clues so figuring out which are decisive is part of the deduction,
not a freebie. clueIds now spans both lists. Existing test renamed
for accuracy; new test confirms false-clue ids pass through.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M6.2: Narrative prompt — wrap false clues + collapse role-leak language

**Files:**
- Modify: `apps/server/src/services/generation/prompts/narrative.system.ts`

- [ ] **Step 1: Update the ANNOTATION RULES section**

In `apps/server/src/services/generation/prompts/narrative.system.ts`, find the ANNOTATION RULES block. Specifically these two lines:

```
- Clues: wrap the first textual appearance of each essential clue. Wrap the noun phrase the kid would tap (the trail of clover sprigs, the muddy footprints, the scrap of paper) — not just the noun on its own and not the whole sentence. Wrap each essential clue at most once across the whole prose.
- Do NOT wrap false-clue mentions.
```

Replace those two lines with:

```
- Clues: wrap the first textual appearance of each CLUE (essential AND false). Wrap the noun phrase the kid would tap (the trail of clover sprigs, the muddy footprints, the scrap of paper) — not just the noun on its own and not the whole sentence. Wrap each clue at most once across the whole prose. Use the clue's id from `essential_clues[i].id` OR `false_clues[i].id` — the inline tag form is the same: `[c:<clue-id>]…[/c]`. The kid should NOT be able to tell essential from false by looking at the prose; that's the deduction.
- Setting/object words that are NOT in essential_clues or false_clues remain plain (don't wrap them).
```

Also update the GOOD/BAD examples just below. The current BAD example:
```
  BAD:  [c:clover-trail]a trail[/c] of fresh [c:clover-trail]clover sprigs[/c]  ← wrap each clue ONCE, not piecewise
```
Keep it. Add a new BAD line under it for clarity:
```
  BAD:  Skipping a false_clue mention because "it's not the answer"  ← wrap false clues too; the kid figures out which is decisive
```

- [ ] **Step 2: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean; 24 passed + 1 skipped.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/generation/prompts/narrative.system.ts
git commit -m "$(cat <<'EOF'
M6.2: narrative prompt — wrap false clues too; pair with M6.1 parser change

ANNOTATION RULES now instructs the LLM to wrap both essential AND
false clues with [c:<id>] tags. Pairs with M6.1 (parser accepts false
clue ids). Kids see all observation pills as gold; figuring out which
are decisive is the puzzle.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M6.3: Collapse role visuals on the client (BriefingCard + AnnotatedNarrative + CharacterPicker)

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`
- Modify: `apps/web/src/screens/PlaybackScreen/AnnotatedNarrative/AnnotatedNarrative.tsx`
- Modify: `apps/web/src/screens/SolutionScreen/CharacterPicker.tsx`

- [ ] **Step 1: BriefingCard — flatten the "You'll meet" roster**

In `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`:

- Remove the `ROLE_ORDER` constant (no longer needed since all non-detective roles render identically — sort by name instead).
- Collapse the `ROLE_BADGE` map for non-detective entries so suspect/witness/bystander all share the same emoji + color + label-less treatment.

Replace `ROLE_BADGE` with:

```ts
const DETECTIVE_BADGE = { emoji: "🕵️", label: "You", color: "var(--accent)" };
const PERSON_BADGE = { emoji: "🤔", color: "var(--bad)" };
```

And update the `others` computation:

```ts
const others = characters
  .filter((c) => c.role !== "detective")
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name));
```

In the JSX, the detective row stays as-is (uses `DETECTIVE_BADGE`). The `others.map(...)` block changes — instead of looking up `ROLE_BADGE[c.role]`, every non-detective character renders the same shape WITHOUT a role label:

```tsx
{others.map((c) => (
  <CastRow
    key={c.id}
    emoji={PERSON_BADGE.emoji}
    label=""
    labelColor={PERSON_BADGE.color}
    name={c.name}
  />
))}
```

And `CastRow` needs to handle empty `label` cleanly — change its body so an empty label hides the label span entirely:

```tsx
function CastRow({
  emoji, label, labelColor, name,
}: { emoji: string; label: string; labelColor: string; name: string }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 13,
        color: "var(--text)",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span>{emoji}</span>
      {label && <span style={{ color: labelColor, fontWeight: 600 }}>{label}</span>}
      {label && <span style={{ color: "var(--text-dim)" }}>—</span>}
      <span>{name}</span>
    </div>
  );
}
```

- [ ] **Step 2: AnnotatedNarrative — collapse per-role colors**

In `apps/web/src/screens/PlaybackScreen/AnnotatedNarrative/AnnotatedNarrative.tsx`, replace the `PERSON_ROLE_COLOR` and `PERSON_ROLE_BG` maps with single constants:

```ts
const PERSON_COLOR = "var(--bad)";
const PERSON_BG = "rgba(231,115,115,0.18)";

const CLUE_COLOR = "#f5c84c";
const CLUE_BG = "rgba(245,200,76,0.20)";
```

Update `AnnotatedSpan` so person annotations use the single color/bg regardless of role:

```tsx
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
    color = PERSON_COLOR;
    bg = PERSON_BG;
    // Use the character's name in the aria-label but NOT a role hint
    aria = `Person: ${inner}`;
  }
  return (
    <button
      type="button"
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

The `characters` Map is no longer used inside the span (we don't look up role), but keep the param for now — M6.7's tap-add flow on PlaybackScreen still needs character lookup, and the prop being passed through is harmless. Actually since AnnotatedSpan doesn't use it anymore, we can remove it from the AnnotatedSpan props and the parent `AnnotatedNarrative` no longer needs to pass it. Clean up: drop `characters` from AnnotatedSpan's prop shape AND drop the `characters` argument from `AnnotatedNarrative` if no other code uses it. (Actually the parent component receives it as a prop from PlaybackScreen — keep it as a prop on AnnotatedNarrative for backward compat, just don't forward to AnnotatedSpan.)

Final AnnotatedSpan signature (without `characters` param):

```tsx
function AnnotatedSpan({
  annotation,
  onTap,
}: {
  annotation: NarrativeAnnotation;
  onTap: (a: NarrativeAnnotation) => void;
}) { ... }
```

And the call site in `AnnotatedNarrative`'s loop drops the `characters` prop:

```tsx
pieces.push(
  <AnnotatedSpan
    key={`${ann.type}-${ann.id}-${ann.offset}`}
    annotation={ann}
    onTap={onTap}
  />
);
```

You can also drop the `const charById = new Map<string, PublicCharacter>(); for (const c of characters) charById.set(c.id, c);` lines since they're no longer used. The outer `AnnotatedNarrative` still accepts `characters` as a prop (for signature stability with M5b.8's PlaybackScreen call site), but if TypeScript strict-mode flags unused props you can remove `characters` from the prop interface too — your call. The simpler version drops it.

If you remove `characters` from AnnotatedNarrative's prop shape, also drop the `characters` arg from the PlaybackScreen call site in this same task to keep the diff coherent. The PlaybackScreen change is one line:

```tsx
<AnnotatedNarrative
  text={text}
  annotations={annotations}
  onTap={(a) => tapAnnotation.mutate(a)}
/>
```

(Remove the `characters={characters}` line.)

- [ ] **Step 3: CharacterPicker — drop role text + collapse to one emoji**

In `apps/web/src/screens/SolutionScreen/CharacterPicker.tsx`:

- Remove the `ROLE_EMOJI` map.
- Render every non-detective card with the same 🤔 emoji + character name only — no role label.

Replace the map block:

```tsx
{suspects.map((c) => {
  const active = selected === c.id;
  return (
    <button
      type="button"
      key={c.id}
      onClick={() => onSelect(c.id)}
      style={{
        padding: 12,
        background: active ? "var(--accent)" : "var(--surface-2)",
        color: active ? "#1a1530" : "var(--text)",
        border: active ? "2px solid var(--accent)" : "2px solid transparent",
        borderRadius: "var(--radius)",
        textAlign: "center",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 32 }}>🤔</div>
      <div style={{ fontWeight: 700 }}>{c.name}</div>
    </button>
  );
})}
```

(The `suspects` filter — `c.role !== "detective"` — stays.)

- [ ] **Step 4: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M6.3: collapse role visuals — BriefingCard, AnnotatedNarrative, CharacterPicker

Per design spec: showing suspect/witness/bystander labels leaks
information ("Mrs. Kamble is a witness" tells the kid she didn't do
it). UI now renders all non-detective characters with the same
generic treatment:
- BriefingCard's "You'll meet" roster: detective row keeps the "You"
  label; every other row shows the name only with a 🤔 emoji prefix
  (no role text). Roster sorted by name.
- AnnotatedNarrative pills: one red color (var(--bad)) for all
  non-detective people. Clue pills unchanged (gold).
- CharacterPicker on solve: 🤔 emoji for every choice, name only,
  no role text underneath.

The server still stores roles for narrative coherence; the client
just doesn't surface them.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M6.4: LogicStructure schema — how_distractors + why_distractors

**Files:**
- Modify: `packages/shared/src/schemas/logicStructure.ts`
- Modify: `packages/shared/src/schemas/logicStructure.test.ts`

- [ ] **Step 1: Add the distractor fields + superRefine checks**

In `packages/shared/src/schemas/logicStructure.ts`, add two new top-level fields to the `logicStructureSchema`. Find the `.object({ ... })` call and add the fields between `true_solution` and `logic_chain`:

```ts
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
}).superRefine((val, ctx) => {
  // ... existing checks unchanged ...
});
```

Then in the `superRefine` block, append (after the existing clue-id duplicate check):

```ts
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
```

- [ ] **Step 2: Add 4 new tests pinning the invariants**

In `packages/shared/src/schemas/logicStructure.test.ts`, find the existing `validLogicStructure()` test factory and add the two new fields (the existing factory probably needs updating to include them — find the function and add `how_distractors: ["a thing", "another thing", "a third thing"], why_distractors: ["one reason", "another reason", "yet another"],` to the returned object).

Then add 4 new test cases at the bottom of the existing `describe` block:

```ts
it("rejects when how_distractors contains the true solution's how", () => {
  const ls = validLogicStructure();
  ls.how_distractors = [ls.true_solution.how, "different one", "another different"];
  const result = logicStructureSchema.safeParse(ls);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.message.includes("how_distractors must not contain the true solution's how"))).toBe(true);
  }
});

it("rejects when how_distractors has duplicates", () => {
  const ls = validLogicStructure();
  ls.how_distractors = ["same", "same", "different"];
  const result = logicStructureSchema.safeParse(ls);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.message.includes("how_distractors must contain 3 distinct strings"))).toBe(true);
  }
});

it("rejects when why_distractors contains the true solution's why", () => {
  const ls = validLogicStructure();
  ls.why_distractors = [ls.true_solution.why, "different reason", "another reason"];
  const result = logicStructureSchema.safeParse(ls);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.message.includes("why_distractors must not contain the true solution's why"))).toBe(true);
  }
});

it("rejects when why_distractors has duplicates", () => {
  const ls = validLogicStructure();
  ls.why_distractors = ["dup", "dup", "different"];
  const result = logicStructureSchema.safeParse(ls);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.message.includes("why_distractors must contain 3 distinct strings"))).toBe(true);
  }
});
```

If the existing tests use a different factory pattern (e.g., not `validLogicStructure()`), use whatever pattern the file already establishes. The key invariants to test are the 4 above. Adapt the factory accordingly so all 4 new tests have valid base structures except for the field being tested.

- [ ] **Step 3: Update the `apps/server/src/services/generation/parseAnnotations.test.ts` `ls()` factory** (cross-file fixup)

The test factory in `parseAnnotations.test.ts` was already updated in M6.1 to include `how_distractors` and `why_distractors` — confirm those are present so M6.4's Zod additions don't break that test. The cast `as LogicStructure` covers any field shape gaps.

- [ ] **Step 4: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/shared test
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: shared tests pass (existing + 4 new). Server tests pass (the `ls()` factory in parseAnnotations.test.ts already has the new fields from M6.1). Total: 12 shared + 24 server = 36 + 1 skipped.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "$(cat <<'EOF'
M6.4: LogicStructure schema gains how_distractors + why_distractors

Per design spec for the multi-choice solve flow: each LogicStructure
must include 3 wrong how options and 3 wrong why options the LLM
generates alongside the true_solution. Zod enforces: exactly 3 each,
distinct from true_solution.how/why, distinct from each other,
non-empty, ≤200 chars. 4 new tests pin the invariants.

The server's submit-solution route can now do a plain === string
compare for how/why (replacing runGrader) since the kid must pick from
the LLM-authored option set.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M6.5: LogicStructure prompt — DISTRACTOR OPTIONS section

**Files:**
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts`

- [ ] **Step 1: Add the SCHEMA mention + new section**

In `apps/server/src/services/generation/prompts/logicStructure.system.ts`, the SCHEMA block at the top describes the JSON shape. Add `how_distractors` + `why_distractors` to the SCHEMA description. Find:

```
  "true_solution": {
    "who_did_it": "<the id of the culprit character>",
    "how": "<one sentence describing the method>",
    "why": "<one sentence describing the motive>"
  },
  "logic_chain": [
```

And insert between true_solution and logic_chain:

```
  "true_solution": {
    "who_did_it": "<the id of the culprit character>",
    "how": "<one sentence describing the method>",
    "why": "<one sentence describing the motive>"
  },
  "how_distractors": [
    "<wrong how option 1>", "<wrong how option 2>", "<wrong how option 3>"
  ],
  "why_distractors": [
    "<wrong why option 1>", "<wrong why option 2>", "<wrong why option 3>"
  ],
  "logic_chain": [
```

- [ ] **Step 2: Add the DISTRACTOR OPTIONS section after CLUE OBFUSCATION**

After the existing CLUE OBFUSCATION section (find the line ending `essential_clues should NOT.` and the closing backtick of the template literal), insert a new section before the closing backtick:

```

DISTRACTOR OPTIONS for multiple-choice solve:
- Generate exactly 3 distinct distractors for how_distractors[] and 3 for why_distractors[].
- Each distractor must be a PLAUSIBLE-sounding but WRONG explanation. A careful eight-year-old reading the clues should be able to rule them out, but a kid skimming should find them tempting.
- Distractors should match the style and length of the true how/why (one sentence each).
- Do NOT make distractors that are obviously wrong (e.g., "the rabbit teleported"). Subtle plausibility = better puzzle.
- Distractors must be DISTINCT from the true solution and from each other.
- Examples for a missing-pet mystery where the true how is "Theo unlatched the hutch and lured Rosie with clover":
    GOOD how_distractors:
      - "A fox dug under the hutch and pulled Rosie out through the back."
      - "The latch was old and finally broke open on its own overnight."
      - "Priya climbed the fence to play with Rosie and left the door open."
    BAD: "Rosie unlocked the latch herself and walked away." (too implausible)
```

(Insert before the closing backtick `;` of the `return` template literal.)

- [ ] **Step 3: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean; 24 passed + 1 skipped.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/generation/prompts/logicStructure.system.ts
git commit -m "$(cat <<'EOF'
M6.5: LogicStructure prompt — DISTRACTOR OPTIONS section

Instructs the LLM to generate 3 plausible-but-wrong how options and
3 plausible-but-wrong why options alongside the true_solution. Spec
includes positive + negative examples (subtle plausibility good,
obviously wrong bad). Pairs with M6.4 schema validation.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M6.6: Server — GET /solve-options + simplified submit-solution

**Files:**
- Modify: `apps/server/src/routes/solutions.ts`

- [ ] **Step 1: Add the GET /solve-options route + simplify submit-solution**

Modify `apps/server/src/routes/solutions.ts`. The submit-solution handler's grader calls are replaced with plain `===` comparisons; a new GET endpoint provides the multi-choice options. Replace the existing file with:

```ts
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runExplanation } from "../services/generation/agents/explanationAgent.js";
import { shortId } from "../utils/ids.js";

const submitBody = z.object({
  guess_who: z.string().min(1),
  guess_how: z.string().min(1).max(400),
  guess_why: z.string().min(1).max(400),
});

export async function solutionsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/submit-solution", async (req, reply) => {
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const existing = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }

    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    // M6: HOW and WHY are multi-choice — kid's pick must exactly equal the true value
    // (no more LLM grader; the LLM-authored option list guarantees one correct choice).
    const who_match = parsed.data.guess_who === ls.true_solution.who_did_it;
    const how_match = parsed.data.guess_how === ls.true_solution.how;
    const why_match = parsed.data.guess_why === ls.true_solution.why;
    const is_correct = who_match && how_match && why_match;
    const outcome: "correct" | "partial" | "incorrect" =
      is_correct ? "correct" :
      (who_match || how_match || why_match) ? "partial" : "incorrect";

    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: parsed.data.guess_who, how: parsed.data.guess_how, why: parsed.data.guess_why },
      outcome,
    });

    const hintRow = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();

    db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      guess_who: parsed.data.guess_who,
      guess_how: parsed.data.guess_how,
      guess_why: parsed.data.guess_why,
      is_correct: is_correct ? 1 : 0,
      who_match: who_match ? 1 : 0,
      how_match: how_match ? 1 : 0,
      why_match: why_match ? 1 : 0,
      hints_used: hintRow.length,
      gave_up: 0,
      explanation,
    }).run();

    reply.status(201);
    return solutionResponse(myst.id);
  });

  app.post<{ Params: { id: string } }>("/mysteries/:id/give-up", async (req, reply) => {
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const existing = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }
    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: null, how: null, why: null },
      outcome: "gave_up",
    });
    const hintRow = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();
    db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      guess_who: null, guess_how: null, guess_why: null,
      is_correct: 0,
      who_match: null, how_match: null, why_match: null,
      hints_used: hintRow.length,
      gave_up: 1,
      explanation,
    }).run();
    reply.status(201);
    return solutionResponse(myst.id);
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/solution", async (req, reply) => {
    const r = solutionResponse(req.params.id);
    if (!r) { reply.status(404); return { error: "not_found" }; }
    return r;
  });

  // M6: pre-solve, the kid needs the (shuffled) multi-choice options for HOW and WHY,
  // plus the cast of characters to pick from for WHO. Detective excluded; role hidden.
  app.get<{ Params: { id: string } }>("/mysteries/:id/solve-options", async (req, reply) => {
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const existing = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }
    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    return {
      characters: ls.characters
        .filter((c) => c.role !== "detective")
        .map((c) => ({ id: c.id, name: c.name })),
      how_options: shuffle([ls.true_solution.how, ...ls.how_distractors]),
      why_options: shuffle([ls.true_solution.why, ...ls.why_distractors]),
    };
  });
}

function solutionResponse(mysteryId: string) {
  const db = getDb();
  const myst = db.select().from(mysteries).where(eq(mysteries.id, mysteryId)).get();
  if (!myst || !myst.logic_structure_json) return null;
  const sol = db.select().from(solutions).where(eq(solutions.mystery_id, mysteryId)).get();
  const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
  return {
    solution: sol ?? null,
    true_solution: sol ? ls.true_solution : null,
    characters: ls.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description })),
    explanation: sol?.explanation ?? null,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = copy[i] as T;
    const aj = copy[j] as T;
    copy[i] = aj;
    copy[j] = ai;
  }
  return copy;
}
```

(Note: `runGrader` import is removed since it's no longer called from this file. `graderAgent.ts`, `grader.system.ts`, and `runGrader` remain in the codebase but become dead code — deletion is a follow-up cleanup commit.)

- [ ] **Step 2: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean; 24 passed + 1 skipped.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/solutions.ts
git commit -m "$(cat <<'EOF'
M6.6: server — GET /solve-options + submit-solution does === instead of LLM grader

New GET /mysteries/:id/solve-options returns: characters (non-detective,
no role) for the WHO picker, plus shuffled how_options + why_options
(true + 3 distractors per field). Guards: 409 if mystery not ready,
409 if already solved.

submit-solution: how_match and why_match are now plain string === checks
against true_solution.how/why. runGrader is no longer called from this
route. Saves ~5s + ~$0.005 per submit. (graderAgent/runGrader stay in
the codebase as dead code; a follow-up commit can delete them once M6
is iPad-validated.)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M6.7: Frontend — solve-options API client + GuessForm picker components

**Files:**
- Create: `apps/web/src/api/solveOptions.ts`
- Modify: `apps/web/src/screens/SolutionScreen/GuessForm.tsx`
- Modify: `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`

- [ ] **Step 1: solve-options API client**

Create `apps/web/src/api/solveOptions.ts`:

```ts
import { api } from "./client.js";

export interface SolveOptions {
  characters: { id: string; name: string }[];
  how_options: string[];
  why_options: string[];
}

export function getSolveOptions(mysteryId: string): Promise<SolveOptions> {
  return api(`/api/mysteries/${mysteryId}/solve-options`);
}
```

- [ ] **Step 2: GuessForm — replace textareas with option pickers**

Replace `apps/web/src/screens/SolutionScreen/GuessForm.tsx` with:

```tsx
import { useState } from "react";
import { Button } from "../../components/Button.js";
import { CharacterPicker } from "./CharacterPicker.js";

export function GuessForm({
  characters,
  howOptions,
  whyOptions,
  onSubmit,
  pending,
}: {
  characters: { id: string; name: string; role: string }[];
  howOptions: string[];
  whyOptions: string[];
  onSubmit: (g: { guess_who: string; guess_how: string; guess_why: string }) => void;
  pending: boolean;
}) {
  const [who, setWho] = useState<string | null>(null);
  const [how, setHow] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  const canSubmit = !!who && !!how && !!why && !pending;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h3 style={{ marginBottom: 8 }}>Who did it?</h3>
        <CharacterPicker characters={characters as never} selected={who} onSelect={setWho} />
      </section>
      <section>
        <h3 style={{ marginBottom: 8 }}>How did they do it?</h3>
        <OptionPicker options={howOptions} value={how} onChange={setHow} ariaPrefix="how" />
      </section>
      <section>
        <h3 style={{ marginBottom: 8 }}>Why did they do it?</h3>
        <OptionPicker options={whyOptions} value={why} onChange={setWhy} ariaPrefix="why" />
      </section>
      <Button
        size="lg"
        disabled={!canSubmit}
        onClick={() => canSubmit && onSubmit({ guess_who: who!, guess_how: how!, guess_why: why! })}
      >
        {pending ? "Checking..." : "Submit my solution"}
      </Button>
    </div>
  );
}

function OptionPicker({
  options,
  value,
  onChange,
  ariaPrefix,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  ariaPrefix: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {options.map((opt, i) => {
        const active = value === opt;
        return (
          <button
            type="button"
            key={`${ariaPrefix}-${i}`}
            onClick={() => onChange(opt)}
            aria-pressed={active}
            style={{
              padding: 12,
              background: active ? "var(--accent)" : "var(--surface-2)",
              color: active ? "#1a1530" : "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "var(--radius)",
              textAlign: "left",
              fontSize: 14,
              lineHeight: 1.5,
              cursor: "pointer",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
```

(Note: the `characters as never` cast on CharacterPicker is a small TS-shape papering — CharacterPicker still types its prop as `PublicCharacter[]` which has `role` and `description`, but solve-options doesn't send those. The cast is acceptable for MVP; M6.7 fix-pass can widen CharacterPicker's prop to make role optional if the typecheck flags it.)

- [ ] **Step 3: SolutionScreen — fetch solve-options + pass through to GuessForm**

Modify `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`. The `mysteryQ` for getMystery still runs (for the title), but a new `solveOptionsQ` provides the picker data. Pass `howOptions`/`whyOptions` to GuessForm; characters now comes from solveOptions, not from mystery.characters.

Replace the file with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getMystery } from "../../api/mysteries.js";
import { getSolveOptions } from "../../api/solveOptions.js";
import { getSolution, submitSolution } from "../../api/solutions.js";
import { ClueSummary } from "./ClueSummary.js";
import { GuessForm } from "./GuessForm.js";
import { HintControls } from "./HintControls.js";
import { RevealPanel } from "./RevealPanel.js";

export function SolutionScreen() {
  const { id } = useParams<{ id: string }>();
  const mysteryId = id!;
  const qc = useQueryClient();

  const mysteryQ = useQuery({ queryKey: ["mystery", mysteryId], queryFn: () => getMystery(mysteryId) });
  const solutionQ = useQuery({ queryKey: ["solution", mysteryId], queryFn: () => getSolution(mysteryId), retry: false });
  const solveOptionsQ = useQuery({
    queryKey: ["solve-options", mysteryId],
    queryFn: () => getSolveOptions(mysteryId),
    retry: false,
  });

  const submitM = useMutation({
    mutationFn: (g: { guess_who: string; guess_how: string; guess_why: string }) => submitSolution(mysteryId, g),
    onSuccess: (data) => { qc.setQueryData(["solution", mysteryId], data); },
  });

  if (!mysteryQ.data) return <div style={{ padding: 24 }}>Loading...</div>;

  const showReveal = solutionQ.data?.solution !== null && solutionQ.data?.solution !== undefined;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", display: "grid", gap: 16 }}>
      <header>
        <Link to={`/mysteries/${mysteryId}`} style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back to story</Link>
        <h1 style={{ marginBottom: 4 }}>{mysteryQ.data.title}</h1>
      </header>

      {!showReveal && <ClueSummary mysteryId={mysteryId} />}
      {!showReveal && <HintControls mysteryId={mysteryId} onGaveUp={() => solutionQ.refetch()} />}
      {!showReveal && solveOptionsQ.data && (
        <GuessForm
          characters={solveOptionsQ.data.characters.map((c) => ({ id: c.id, name: c.name, role: "suspect" }))}
          howOptions={solveOptionsQ.data.how_options}
          whyOptions={solveOptionsQ.data.why_options}
          onSubmit={(g) => submitM.mutate(g)}
          pending={submitM.isPending}
        />
      )}
      {!showReveal && solveOptionsQ.isLoading && (
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Loading options...</p>
      )}
      {showReveal && solutionQ.data && <RevealPanel data={solutionQ.data} />}
    </div>
  );
}
```

(The `{ id, name, role: "suspect" }` mapping satisfies the existing `PublicCharacter` shape that GuessForm → CharacterPicker expects. The frontend now doesn't get the real role from the server at all on this screen — by design.)

- [ ] **Step 4: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M6.7: frontend — solve-options client + multi-choice GuessForm

New apps/web/src/api/solveOptions.ts wraps GET /solve-options.
SolutionScreen fetches solveOptionsQ alongside mysteryQ + solutionQ;
passes characters + how_options + why_options to GuessForm.

GuessForm's HOW and WHY are now OptionPicker components (vertical
button rows, one per option). State is per-field selected-or-null;
canSubmit requires all three picked. WHO picker (CharacterPicker)
is unchanged in shape but receives the role-less characters list
from solve-options (mapped to role="suspect" for the existing
component contract).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M6.8: Live LLM verification (2 fresh generations + tap-through end-to-end)

**Files:** none (verification only)

- [ ] **Step 1: Build + boot the local server + Vite**

```bash
pnpm --filter @mysterio/shared build > /tmp/build.log 2>&1
pnpm --filter @mysterio/server build >> /tmp/build.log 2>&1
pnpm --filter @mysterio/web build >> /tmp/build.log 2>&1 && echo "BUILDS OK"
(cd apps/server && node --env-file=.env dist/src/index.js > /tmp/m6.srv.log 2>&1 &)
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
echo "$MID1" > /tmp/m6.mid1
echo "$MID2" > /tmp/m6.mid2

for i in $(seq 1 40); do
  S1=$(curl -sS "http://localhost:3000/api/mysteries/$MID1" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  S2=$(curl -sS "http://localhost:3000/api/mysteries/$MID2" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
  printf "[%2d] m1=%s m2=%s\n" "$i" "$S1" "$S2"
  if [[ "$S1" == "ready" || "$S1" == "failed" ]] && [[ "$S2" == "ready" || "$S2" == "failed" ]]; then break; fi
  sleep 5
done
```
Expected: both flip to `ready`. If a `failed` happens at `narrative_clue_coverage`, regenerate that one — it's the M3.1 stochastic issue, not M6.

- [ ] **Step 3: Inspect distractors in DB**

```bash
MID1=$(cat /tmp/m6.mid1)
python3 <<EOF
import sqlite3, json
con = sqlite3.connect("data/mysterio.db")
row = con.execute("SELECT logic_structure_json FROM mysteries WHERE id=?", ("$MID1",)).fetchone()
ls = json.loads(row[0])
print("=== how ===")
print(f"true: {ls['true_solution']['how']}")
print(f"distractors:")
for d in ls['how_distractors']: print(f"  - {d}")
print()
print("=== why ===")
print(f"true: {ls['true_solution']['why']}")
print(f"distractors:")
for d in ls['why_distractors']: print(f"  - {d}")
print()
print("=== false clues annotated? ===")
clue_ann_ids = sorted(set(a['id'] for a in json.loads(con.execute('SELECT narrative_annotations FROM mysteries WHERE id=?', ('$MID1',)).fetchone()[0] or '[]') if a['type'] == 'clue'))
essential_ids = [c['id'] for c in ls['essential_clues']]
false_ids = [c['id'] for c in ls['false_clues']]
print(f"annotated clue ids: {clue_ann_ids}")
print(f"essential ids:      {essential_ids}")
print(f"false ids:          {false_ids}")
false_annotated = [i for i in clue_ann_ids if i in false_ids]
print(f"false clues highlighted: {len(false_annotated)} / {len(false_ids)}")
EOF
```
Expected: 3 distinct how_distractors (no overlap with true_solution.how), 3 distinct why_distractors (no overlap), false_clues_highlighted ≥ 1 (at least one false clue should be wrapped in the narrative).

- [ ] **Step 4: Test the /solve-options endpoint**

```bash
MID1=$(cat /tmp/m6.mid1)
curl -sS "http://localhost:3000/api/mysteries/$MID1/solve-options" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'characters: {len(d[\"characters\"])} (no role field: {\"role\" not in (d[\"characters\"][0] if d[\"characters\"] else {})})')
print(f'how_options: {len(d[\"how_options\"])} entries')
for o in d['how_options']: print(f'  - {o[:80]}')
print(f'why_options: {len(d[\"why_options\"])} entries')
for o in d['why_options']: print(f'  - {o[:80]}')
"
```
Expected: 4 characters (non-detective, with `id` + `name` only — no `role`), 4 how_options, 4 why_options.

- [ ] **Step 5: Submit a CORRECT solution and verify === grading**

```bash
MID1=$(cat /tmp/m6.mid1)
python3 <<EOF
import sqlite3, json, urllib.request
con = sqlite3.connect("data/mysterio.db")
ls = json.loads(con.execute("SELECT logic_structure_json FROM mysteries WHERE id=?", ("$MID1",)).fetchone()[0])
body = json.dumps({
    "guess_who": ls["true_solution"]["who_did_it"],
    "guess_how": ls["true_solution"]["how"],
    "guess_why": ls["true_solution"]["why"],
}).encode()
req = urllib.request.Request(
    f"http://localhost:3000/api/mysteries/$MID1/submit-solution",
    data=body, headers={"Content-Type": "application/json"}, method="POST")
resp = json.loads(urllib.request.urlopen(req).read())
sol = resp["solution"]
print(f"is_correct: {sol['is_correct']}")
print(f"who_match:  {sol['who_match']}")
print(f"how_match:  {sol['how_match']}")
print(f"why_match:  {sol['why_match']}")
print(f"explanation: {(resp['explanation'] or '')[:200]}...")
EOF
```
Expected: `is_correct: 1, who_match: 1, how_match: 1, why_match: 1`. The explanation field is populated.

- [ ] **Step 6: Boot Vite + Playwright end-to-end (if possible in your environment)**

```bash
cd apps/web && npx vite --host 127.0.0.1 --port 5173 > /tmp/m6.vite.log 2>&1 &
sleep 5
# Then in a Playwright session:
# - localStorage 'mysterio.activePlayer' = {"state":{"activePlayerId":"p2"}, "version":0}
# - navigate to http://127.0.0.1:5173/mysteries/$MID2/solve
# - confirm: ClueSummary visible; HintControls visible; 3 sections (Who/How/Why) each with multi-choice buttons
# - tap WHO suspect → tap HOW option → tap WHY option → Submit
# - confirm RevealPanel renders
```

If Playwright isn't available in your environment, skip and report — the controller's M6.9 deploy + iPad smoke covers visual verification.

- [ ] **Step 7: Stop local servers**

```bash
pkill -f "node --env-file=.env dist/src/index.js" 2>/dev/null
pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null
sleep 1
```

---

## Task M6.9: Deploy + iPad handoff

**Files:** none (deploy + handoff)

- [ ] **Step 1: Deploy**

```bash
bash scripts/deploy.sh
```
Expected: build → rsync → install → migrate → restart → health passes.

- [ ] **Step 2: Remote spot-check (generate + verify distractors + tap-through)**

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

echo "=== /solve-options on prod ==="
curl -sS "https://panther-golem.exe.xyz/api/mysteries/$MID/solve-options" | python3 -m json.tool
```
Expected: 4 characters (no role), 4 how_options, 4 why_options.

- [ ] **Step 3: iPad handoff checklist**

```
Live at https://panther-golem.exe.xyz/

iPad walkthrough (M6):
1. Pick a player; generate a fresh Easy missing-pet mystery; wait ~90s.
2. Tap "📖 Start the story" on the briefing.
3. Confirm the BriefingCard's "You'll meet" roster shows ONLY names (no
   suspect/witness/bystander labels) — every non-detective is just "🤔 Name".
4. Confirm the narrative now has MORE gold pills than before (false clues
   are also highlighted) — you can't tell essential from false by looking.
5. All non-detective people in the prose are the same red color (no role
   leak via pill color).
6. Tap "I think I know!" → SolutionScreen loads.
7. Three sections (Who/How/Why) each render as button rows. No textareas.
8. Tap the WHO suspect (no role labels under the names), tap a HOW option,
   tap a WHY option, then Submit.
9. RevealPanel renders with correct/partial/incorrect badge + explanation.
10. Try a fresh mystery + give-up flow — RevealPanel renders gave-up badge.
```

- [ ] **Step 4: Mark M6 complete**

If the iPad smoke passes: M6 shipped. The dead-code cleanup (delete graderAgent / grader.system / runGrader / compareSolutions) is the next small commit on this branch.

If anything is off, report back and we'll iterate before retiring the grader path.

---

## Self-Review

Checked against `docs/superpowers/specs/2026-05-17-m6-reduce-info-leakage-design.md`:

| Spec section | Implementation |
|---|---|
| §Goal 1 (highlight false clues) | M6.1 (parser) + M6.2 (prompt) |
| §Goal 2 (collapse roles on client) | M6.3 (BriefingCard + AnnotatedNarrative + CharacterPicker) |
| §Goal 3 schema (how_distractors + why_distractors) | M6.4 |
| §Goal 3 prompt (LLM generates distractors) | M6.5 |
| §Goal 3 server (GET /solve-options + simplified submit) | M6.6 |
| §Goal 3 frontend (multi-choice GuessForm) | M6.7 |
| Acceptance: live LLM produces distractors + options | M6.8 |
| Acceptance: deployed + iPad smoke | M6.9 |

Plan failures scan (per writing-plans skill):
- No "TBD" / "implement later" / "appropriate error handling" / "similar to Task N".
- All endpoints, types, functions, and imports are defined in earlier tasks before being referenced.
- Method names consistent: `getSolveOptions` (not `fetchSolveOptions`), `shuffle` internal helper, `OptionPicker` internal to GuessForm.
- `.js` import extensions throughout (project ESM convention).
- Commit-message Co-Authored-By trailer is `Claude Sonnet 4.6`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-m6-implementation.md`. Subagent-driven execution with sonnet, per `workflow_subagent_driven` + `workflow_model_selection`. 9 tasks: M6.1-M6.7 implementation, M6.8 live verification, M6.9 deploy + iPad handoff. M5b iPad smoke is in-progress in parallel — M6 layers cleanly on top.
