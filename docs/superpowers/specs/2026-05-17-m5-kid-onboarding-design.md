# M5 design — kid-onboarding + annotated narrative

> Brainstormed 2026-05-17 in response to 10-year-old playtest feedback on the M4 build: "story is confusing", "didn't know I was Maya until the end", "didn't really know who the suspects were", "problem wasn't really clear". This spec covers two stages — **M5a** (identity + briefing card; fast, no migrations) and **M5b** (annotated narrative + auto-Notes; the big redesign). M5a ships first and is validated on iPad before M5b begins.

## Goals

Make Mysterio understandable for the target 8-13 audience by:

1. **Establishing the kid's identity** as the detective, the same way Pokémon games tell you "you are Ash" — once, clearly, and consistently across all play.
2. **Stating the goal up front** — "today's case is X, your job is to figure out who/how/why" — so the kid doesn't reverse-engineer the problem from the prose.
3. **Surfacing the people and clues** visually inside the narrative so a kid skimming the prose can tell who's a suspect, who's a witness, and what's worth writing down.
4. **Lowering note-taking friction** — tapping a highlight auto-creates a Notes entry; the kid can then add their own thoughts.

## Non-goals

- No audio in this milestone (TTS still deferred to M3.3-new).
- No avatar customisation. The detective's name is the player's profile name; no portrait.
- No motive-specific highlights (motives surface in the person tooltip).
- No multi-player session sharing of notes.
- No content-rating or COPPA changes (anonymous device-id auth stays).

---

## Milestone split

| Milestone | Scope | DB migrations | New components | Sizing |
|---|---|---|---|---|
| **M5a** | Identity + briefing card | None | `BriefingCard` | ~1 day (5 tasks) |
| **M5b** | Annotated narrative + auto-Notes | 2 | `AnnotatedNarrative`, focused-mode in `ClueTracker` | ~2-3 days (8-10 tasks) |

The split exists because M5a is high-confidence, ships fast, and validates the identity/onboarding hypothesis before we invest in the bigger M5b feature.

---

## M5a — Player-name detective + main-page hero + briefing card

### M5a.1 — Player name flows into the LLM as the detective

Today the LogicStructure agent invents a detective name per mystery (Maya, Priya, etc.). After M5a, the player's profile name (e.g., "Lily") is passed in and the agent must use it as the detective character's name.

**Generation pipeline change:**
- `runGeneration(...)` in `apps/server/src/services/generation/orchestrator.ts` already has the `playerId`. It fetches the player row to get `name` and passes it into `runLogicStructureAgent({ playerName, ... })`.
- `runLogicStructureAgent` adds `playerName: string` to its input interface and includes the name in the user message it sends to Claude (the system prompt stays generic).

**LogicStructure prompt change** (`logicStructure.system.ts`):
- New rule, near the top: "The DETECTIVE character must be named exactly as the player's name will be provided in the user message. They are age 10, the listener's stand-in. Give them a curious, observant personality and a notebook they carry everywhere."
- Existing rules about character distinctness still apply for suspects/witnesses/bystanders.
- The DESIGN RULES section remains; CLUE OBFUSCATION (from M4-tune) remains.

**User-message wrapper** (the orchestrator):
- Currently sends `{ difficulty, category, previousFailureNotes? }`. Adds `playerName`.

### M5a.2 — Main-page hero on `MainScreen`

A small hero block above "Pick a mystery":

```
WELCOME BACK
Detective Lily 🕵️
```

- Uses the existing `usePlayerStore().activePlayerId` + the `useQuery(listPlayers)` lookup that MainScreen already runs.
- ~5 lines of JSX. Inline styles, matching the existing aesthetic.
- No localStorage flags, no first-run state.

### M5a.3 — `BriefingCard` component on `PlaybackScreen`

A small centred card shown when `mystery.status === "ready"` and before the kid taps to start reading.

**Visual** (from brainstorm option B):
```
            🐾
        TODAY'S CASE
   Where Did Snowdrop Go?

Your job: figure out **who**, **how**, **why**.

YOU'LL MEET
🕵️ You — Detective Lily
🤔 Suspect — Oliver
🤔 Suspect — Jasper
👀 Witness — Mrs. Kamble
🧍 Bystander — Luna

      [ 📖 Start the story ]
```

**Component**: `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`
- Props: `mystery: MysteryDetail`, `playerName: string`, `onStart: () => void`
- Reads `mystery.title`, `mystery.category`, `mystery.characters[]`
- Maps `role` to badge: detective → 🕵️ (label "You"), suspect → 🤔, witness → 👀, bystander → 🧍
- Maps `category` to icon: `missing-pet` → 🐾, `haunted-mansion` → 👻, `stolen-treasure` → 💎, `locked-room` → 🔐
- "Start the story" button → `onStart()`

**Integration in `PlaybackScreen.tsx`**:
- Local state `const [started, setStarted] = useState(false);`
- After the existing `!ready` guards, if `!started` render `<BriefingCard mystery={data} playerName={player.name} onStart={() => setStarted(true)} />`
- Else render the existing prose + ClueTracker layout

**No persistence**: the briefing shows every time the kid loads the URL. The "Start" tap is local-only; refreshing the page brings the briefing back. This is intentional (re-read = re-orient) and zero-effort to implement.

### M5a tasks

| # | Task | Files |
|---|---|---|
| M5a.1 | Pass `playerName` through generation pipeline + tune LogicStructure prompt | orchestrator.ts, logicStructureAgent.ts, logicStructure.system.ts |
| M5a.2 | Main-page hero on MainScreen | MainScreen.tsx |
| M5a.3 | `BriefingCard` component + integration | new BriefingCard/, PlaybackScreen.tsx |
| M5a.4 | Verify with two fresh live LLM generations (different categories) — confirm detective name = player name, briefing renders cast | none |
| M5a.5 | Deploy to panther-golem.exe.xyz + iPad smoke handoff | none |

---

## M5b — Annotated narrative + auto-Notes (queued behind M5a iPad validation)

### M5b.1 — Inline-delimiter narrative output

The narrative agent emits prose with inline tags:

```
[p:oliver]Oliver[/p] knelt near the hutch and looked at the [c:clover-trail]trail of clover sprigs[/c] leading away across the grass.
```

**Tag grammar:**
- `[p:<character-id>]…[/p]` — person reference (suspect / witness / bystander only; NOT detective)
- `[c:<clue-id>]…[/c]` — essential clue reference (clue-id from `essential_clues[i].id`)
- False clues are NOT wrapped. Detective is NOT wrapped (kid is the detective).
- A character should only be wrapped on first mention per paragraph to avoid visual noise.

**Narrative prompt additions** (`narrative.system.ts`):
- New ANNOTATION RULES section: spells out the tag grammar, the "first mention per paragraph" rule, the ids-from-LogicStructure rule, and gives one positive example.
- "Wrap with `[p:<id>]Name[/p]` whenever you name a non-detective character. Use the exact ids from `characters[]`. Wrap each essential clue's first textual appearance with `[c:<id>]…[/c]` covering the noun phrase the kid would tap (the trail of clover sprigs, the muddy footprints, the scrap of paper). Do NOT wrap clue mentions that occur in the same paragraph as their first wrap."
- The existing PRESERVE THE CLUE'S LEVEL OF AMBIGUITY rule remains; the clue tag wraps the observation but doesn't add identifying info.

### M5b.2 — Server-side parser

New util `apps/server/src/services/generation/parseAnnotations.ts`:

```ts
export interface NarrativeAnnotation {
  type: "person" | "clue";
  id: string;       // character id or essential_clue id
  offset: number;   // index into the clean (tag-stripped) text
  length: number;   // length of the tagged span in the clean text
  text: string;     // the original wrapped text (e.g. "Oliver" or "trail of clover sprigs")
}

export function parseNarrativeAnnotations(
  rawWithTags: string,
  ls: LogicStructure,
): { text: string; annotations: NarrativeAnnotation[] };
```

- Walks the input once, regex-matching `\[(p|c):([^\]]+)\](.+?)\[\/\1\]` against the *unconsumed* tail (or uses index-walking for safety).
- For each match: validate id exists (`p` → characters by id, excluding detective; `c` → essential_clues by id). If invalid, log a warning and drop the tag (keep inner text).
- Computes `offset` in the clean (stripped) text, not the raw input.
- The narrative agent's outer retry logic (text-match for essential_clue coverage) runs on the CLEAN text after parsing.

### M5b.3 — Storage

**DB migrations** (one file, two ALTERs):
- `ALTER TABLE mysteries ADD COLUMN narrative_annotations TEXT;` — JSON-as-text, contains the `NarrativeAnnotation[]` from the parser, or null for pre-M5b mysteries.
- `ALTER TABLE clues ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';` — `"manual"` or `"annotation"`.
- `ALTER TABLE clues ADD COLUMN annotation_id TEXT;` — nullable. Composite of `(p|c)-<id>` so the same character or clue can't be added twice.
- `CREATE UNIQUE INDEX clues_mystery_annotation_uniq ON clues(mystery_id, annotation_id) WHERE annotation_id IS NOT NULL;` — dedupe at the DB level so the kid can re-tap without duplicating.

**Schema additions in `@mysterio/shared`:**
- `NarrativeAnnotation` interface re-exported (mirrors server's parser type).
- `MysteryDetail.narrative_annotations?: NarrativeAnnotation[]` (nullable for pre-M5b rows).
- `Clue.source: "manual" | "annotation"`.
- `Clue.annotation_id: string | null`.

### M5b.4 — Frontend rendering

**`AnnotatedNarrative` component**: takes `text`, `annotations`, `onTap(annotation)`. Walks the text, splits into non-annotated text spans + annotated pill spans (style A from brainstorm: rounded pill background, role color for `p`, gold for `c`). Each pill is a `<button>` with `aria-label` and `onClick={() => onTap(ann)}`.

**Tap handler in `PlaybackScreen`**:
- POSTs to `/api/mysteries/:id/clues` with `{ category_type, content, source: "annotation", annotation_id }`
- `category_type`: for `p` annotations always `"character"`; for `c` annotations uses the LogicStructure's `essential_clues[i].category_type`.
- `content`: for `p` uses the character's name + a one-line role description; for `c` uses the LogicStructure clue's `description`.
- On success (201 or 200 dedupe): set `clueTrackerFocusedId` state to the returned clue id, which opens the ClueTracker drawer in focused mode.

**`ClueTracker` focused-mode additions**:
- New prop `focusedClueId?: string` and callback `onFocusChange(id: string | null)`.
- When `focusedClueId` is set: expand the drawer, switch to the tab matching that clue's `category_type`, scroll the row into view, and render its content with a soft glow + "add your own thoughts" input inline (the input pre-focuses the row).
- Existing manual-add flow is unchanged.

**Auto-added rows visual treatment**: a subtle ✨ "auto-added" badge on the row so the kid knows the difference. Edit/Delete still work the same.

### M5b.5 — API change

`POST /api/mysteries/:id/clues` body schema gets two new optional fields:
- `source?: "manual" | "annotation"` — defaults to `"manual"`
- `annotation_id?: string` — required when `source: "annotation"`

Handler logic:
- If `source === "annotation"`: SELECT for existing `(mystery_id, annotation_id)` row first.
  - If exists → return 200 + existing row (kid can re-tap without duplicate).
  - If not → INSERT with source + annotation_id.
- Else: existing manual flow.

The unique partial index is defense-in-depth in case two taps land concurrently.

### M5b tasks

| # | Task | Files |
|---|---|---|
| M5b.1 | DB migration (mysteries.narrative_annotations, clues.source, clues.annotation_id, unique index) | new migration file, schema.ts |
| M5b.2 | Shared types — NarrativeAnnotation, Clue.source/annotation_id, MysteryDetail.narrative_annotations | packages/shared |
| M5b.3 | Narrative prompt — inline delimiter rules | narrative.system.ts |
| M5b.4 | parseAnnotations util + orchestrator integration (store clean text + JSON annotations) | new parseAnnotations.ts, orchestrator.ts |
| M5b.5 | Server: clues POST accepts source + annotation_id; GET mystery returns narrative_annotations | clues.ts, mysteries.ts |
| M5b.6 | AnnotatedNarrative component (pill rendering, tap handler) | new AnnotatedNarrative.tsx |
| M5b.7 | ClueTracker focused-mode + auto-added visual | ClueTracker.tsx, ClueEditor.tsx |
| M5b.8 | PlaybackScreen wires AnnotatedNarrative + focused-state to ClueTracker | PlaybackScreen.tsx |
| M5b.9 | Verify with two fresh live LLM generations; tap-add flow end-to-end | none |
| M5b.10 | Deploy to panther-golem.exe.xyz + iPad smoke handoff | none |

---

## Out-of-scope items deferred to later milestones

These came up during brainstorming but were ruled out for M5:

- **Customisable detective avatar** (kid picks a face / hat) — interesting but not load-bearing for clarity.
- **First-run tutorial overlay** — rejected in favour of the persistent hero + briefing.
- **Three-way highlight (people + clues + motives)** — motives surface in the person tooltip instead.
- **Notes provenance UI** — auto vs manual are both in one combined list. The ✨ badge is the only differentiator.
- **Cross-mystery notes carry-over** — Notes are still per-mystery.
- **Backfill of pre-M5b mysteries with annotations** — old rows have `narrative_annotations = null`; the frontend renders them as plain prose (no pills).
- **Tooltip motive hints** ("Why might Oliver have wanted Snowdrop?") inside the person detail — listed in spec for completeness, but a v2 polish item.

---

## Acceptance criteria

**M5a (this round):**
- A fresh generation for player "Lily" produces a LogicStructure whose detective character is named "Lily". Verified via DB inspection on two fresh generations across different categories.
- MainScreen renders "Welcome back, Detective Lily 🕵️" above the existing grid.
- PlaybackScreen for a ready mystery first renders the BriefingCard with the title, category emoji, "Your job" line, cast roster (with role badges), and "Start the story" button. Tapping Start reveals the existing narrative + ClueTracker.
- Build + typecheck + tests clean on every commit.
- Deployed to `panther-golem.exe.xyz` and iPad-tested by the user.

**M5b (later round, after M5a iPad test):**
- A fresh generation produces prose with inline `[p:…]` and `[c:…]` tags. The parser strips them; the clean prose is stored in `narrative_text` and the parsed annotations in `narrative_annotations`.
- PlaybackScreen renders the prose with pill highlights (red suspect, blue witness, grey bystander, gold clue) in the style-A pill treatment.
- Tapping a pill auto-POSTs a clue with the right `source` / `annotation_id` and opens the ClueTracker drawer focused on it. Re-tapping the same pill opens the drawer focused on the existing row — no duplicate.
- ClueTracker rows that came from annotations show a ✨ auto-added badge; manual rows look as they do today.

---

## Spec self-review

- **Placeholders:** no TBD, TODO, or vague requirements.
- **Internal consistency:** the M5a architecture (no migration, prompt + UI only) matches the task list; M5b's migration, parser, and UI all reference each other consistently.
- **Scope:** M5a is comfortably one implementation plan. M5b is borderline — it has 10 tasks across DB + schema + prompt + parser + 2 frontend components + API. May benefit from being split again at the writing-plans stage; flagged here for the planner to consider.
- **Ambiguity:** the "first mention per paragraph" rule for `[p:…]` tags is a soft heuristic the LLM may interpret loosely. Acceptance is "looks reasonable on a real generation", not a strict check. If it surfaces as a problem we can tighten the prompt or add server-side dedupe by counting wraps per paragraph.

Approved at the architecture/scope level by the user 2026-05-17. Ready to translate M5a into an implementation plan.
