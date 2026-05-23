# M4 design — Clue tracker + solution flow + hints (pivot from M5)

**Status:** Approved 2026-05-16.
**Pivot from:** `docs/superpowers/plans/2026-05-04-mysterio-implementation.md` (M4 = clue tracker + solve; M5 = hints + polish; M3 = narrative + TTS).
**Pivot to:** M4 absorbs hints (originally M5.1 + M5.2); M3 splits into narrative (already shipped: M3.1 + M3.2-new) and audio-only (M3.3-new onward) which is **deferred until after M4 lands and is validated on iPad**; M5 keeps polish + ship only.
**Spec PRD context:** `docs/superpowers/specs/2026-05-04-mysterio-prd.md` §6 (UI), §7 (data model), §8 (AI agents), §9 (risks #9 "two-tier hints").

## 1. Why pivot now

M3.1 (narrative agent) + M3.2-new (orchestrator narrative wiring) shipped on 2026-05-16; the live deploy at `https://panther-golem.exe.xyz/` now serves real LLM-written prose. User decided to validate the **complete kid-loop without audio** (read narrative → take notes → submit guess → see reveal → optionally use hints) on iPad before investing in TTS. Audio is a multi-task expense (TTS provider + storage + orchestrator wiring + frontend player + transcript) that's better committed after the read/solve/hint experience is dialed in.

Hints come into M4 (not M5) because they're tightly coupled to the SolutionScreen UX — without them the give-up safety valve is missing and the kid's loop can dead-end in frustration.

## 2. Scope

Three additions to the codebase, none touching narrative or audio:

1. **Clue tracker** — a kid-facing notes UI on `PlaybackScreen`, persisted server-side. 5 categories (character / item / location / event / note). CRUD on `clues` table.
2. **Solution flow** — a new `SolutionScreen` (route: `/mysteries/:id/solve`). Tap-the-suspect character picker, two short text fields (how / why), submit. Backend grades via the existing `compareSolutions` (M2.6) + a new `explanationAgent` to write a kid-friendly recap. RevealPanel shows the outcome.
3. **Hint system** — two-tier on `SolutionScreen`: up to two `hintAgent`-generated nudges (server-enforced cap), plus a "give up" button that creates a solution row with `gave_up=1` and surfaces the same explanation.

### Out of scope (explicit)

- TranscriptPanel auto-scroll — M3-audio
- `audio_timestamp_ms` population on clues — M3-audio (the column stays in the schema and is written as `null` this milestone)
- `AudioPlayer`, `useAudioPlayer`, `usePlaybackStore` — M3-audio
- Error boundaries, mobile responsiveness polish, favicon, "Switch player" UI — M5
- Real-kid iPad smoke test — M5

## 3. Task ordering

Seven tasks. The first five lift directly from plan §M4.1-§M4.5 (only M4.3 is modified). The last two lift from plan §M5.1-§M5.2.

| # | Task | Source | Modification |
|---|---|---|---|
| M4.1 | Clue + Solution + Hint shared types | plan §M4.1 | none |
| M4.2 | Clues router (CRUD) | plan §M4.2 | none |
| M4.3 | ClueTracker UI as **bottom-sheet drawer** | plan §M4.3 | (a) drop `usePlaybackStore` dependency; (b) `audio_timestamp_ms` always passes `null`; (c) render as collapsible bottom sheet (collapsed→expanded states) instead of inline. Matches spec PRD §6. |
| M4.4 | Solution submit + give-up endpoints + `explanationAgent` | plan §M4.4 | none |
| M4.5 | SolutionScreen with character picker, guess form, reveal | plan §M4.5 | none |
| **M4.6** | **`hintAgent` + `POST /api/mysteries/:id/hints` endpoint** | **plan §M5.1** | none (lifted as-is) |
| **M4.7** | **`HintControls` UI on SolutionScreen + give-up confirm** | **plan §M5.2** | none (lifted as-is) |

## 4. Backend

### Routes added

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/mysteries/:id/clues` | — | `{ clues: Clue[] }` | per-mystery |
| `POST` | `/api/mysteries/:id/clues` | `{ category_type, content, audio_timestamp_ms? }` | `201 { clue }` | M4 client always omits `audio_timestamp_ms`; column persists `null`. The Zod body schema keeps the field as `optional` (not removed) so M3-audio can start populating it without an API contract change. |
| `PATCH` | `/api/mysteries/:id/clues/:clueId` | `{ content }` | `200 { clue }` | content edit only; tab can't change |
| `DELETE` | `/api/mysteries/:id/clues/:clueId` | — | `204` | |
| `POST` | `/api/mysteries/:id/solution` | `{ guess_who, guess_how, guess_why }` | `201 { solution }` | calls `compareSolutions` (M2.6) for who-strict + grader for how/why; calls `explanationAgent`; caches `explanation` on the solution row |
| `POST` | `/api/mysteries/:id/give-up` | — | `201 { solution }` | creates a solution row with `gave_up=1`, `is_correct=0`, populates `explanation` via `explanationAgent` |
| `POST` | `/api/mysteries/:id/hints` | — | `201 { hint }` or `429` | server counts `hints WHERE mystery_id=:id`; ≥2 → `429 {error:"hint_cap_reached"}` |

### Agents added

**`hintAgent`** (`apps/server/src/services/generation/agents/hintAgent.ts` + `prompts/hint.system.ts`):
- Input: full unredacted `LogicStructure` + `string[]` of prior hint texts.
- Output: `{ hint: string }`, 5-300 chars. Single sentence. Must point at one essential clue without naming the culprit, the method, or the motive. If all essential clues have already been hinted, restate the most decisive one differently.
- Cache: `SAFETY_PREAMBLE` only (matches M2 pattern).
- Failure mode: returns a safe fallback string (`"Re-listen to the part where the detective notices something out of place."`) on JSON-parse / Zod failure — never throws. Hint endpoint is fail-soft (the kid always gets *something*).

**`explanationAgent`** (`apps/server/src/services/generation/agents/explanationAgent.ts` + `prompts/explanation.system.ts`):
- Input: full `LogicStructure` + the kid's guess (or `null` for give-up).
- Output: `{ explanation: string }`, 50-150 words, kid-friendly recap tying essential clues to the answer.
- Cache: `SAFETY_PREAMBLE` only.
- Called once per `solution` row at create-time; persisted on `solutions.explanation`; never regenerated on subsequent GETs.

### DB tables (already in schema)

`clues`, `solutions`, `hints` were declared in M1 migrations (plan §M1.4-M1.7) but unused. M4 starts persisting to them.

- `clues`: `id` (pk), `mystery_id` (fk), `category_type` (enum check), `content` (text), `audio_timestamp_ms` (nullable int), `created_at`. Indexed on `mystery_id`.
- `solutions`: `id` (pk), `mystery_id` (fk, unique — one solution per mystery), `guess_who/how/why` (nullable text), `who_match / how_match / why_match` (nullable bool), `is_correct` (bool), `hints_used` (int default 0), `gave_up` (bool default 0), `explanation` (nullable text), `created_at`. `mystery_id` is unique → re-submit is conflict.
- `hints`: `id` (pk), `mystery_id` (fk), `content` (text), `created_at`. Counted at create-time to enforce the ≤2 cap.

### Status transitions

No changes to `mysteries.status` flow (still pending → generating_logic → validating → writing → ready; M3-audio will later add synthesizing).

## 5. Frontend

### `PlaybackScreen` changes

- Narrative continues to render in the existing prose `<div>` (`whiteSpace: pre-wrap, lineHeight: 1.6`). No change.
- "Audio comes in M3 — narrative shown for now" placeholder copy stays (still true).
- New: `<ClueTracker mysteryId={id} />` rendered at the *bottom* of the screen as a collapsed sheet.
- "I think I know!" CTA links to `/mysteries/:id/solve` (already wired in the current screen).

### `ClueTracker` (bottom-sheet drawer)

- **Collapsed state** (default): a compact pill at the bottom of the viewport: `📝 Clue Tracker — N clues  ▲ Tap to open`. Stays out of the kid's way while reading. ~48px tall.
- **Expanded state**: slides up to ~60% viewport height. Contains: `ClueCategoryTabs` (5 tabs: Characters / Items / Locations / Events / Notes), a scrollable list of `ClueEditor` rows for the active tab (inline edit/delete), and an `<input>` + `Add` button at the bottom. Closed via tap on a chevron at the top of the sheet or tap on the backdrop overlay.
- State: local component state for collapsed/expanded; clue data via TanStack Query (`["clues", mysteryId]`).
- No `usePlaybackStore` dependency. `audio_timestamp_ms` is always passed as `null` (or omitted) by the client.

### `SolutionScreen` (new, route `/mysteries/:id/solve`)

Sections, top to bottom:

1. **Header**: ← Back to PlaybackScreen.
2. **`HintControls`**: collapsed "Need a hint?" button. Expanded shows two CTAs:
   - `Give me a clue (N of 2)` — disabled when N=0 ("All hints used"). Tapping POSTs to `/hints`. The returned hint renders as a small card above the form; **all requested hints stay visible (stacked, newest at top) until the kid leaves the screen** so they don't have to remember the first one when reading the second.
   - `I give up — tell me` — tapping shows a one-step confirm ("This will reveal the answer. Sure?"), then POSTs to `/give-up`, then transitions the screen into the reveal state.
3. **`CharacterPicker`**: a grid of suspect cards (only `role: 'suspect'` from `data.characters`). Tap to select. Selected card has a visual ring/badge.
4. **Guess form**: two short text inputs labeled "How did they do it?" (~120 char limit) and "Why did they do it?" (~120 char limit).
5. **Submit button**: disabled until a character is picked and both text fields have content. On submit, POSTs to `/solution`, then transitions to reveal.

### `RevealPanel` (within `SolutionScreen` post-submit)

Renders the `solution` row returned by `/solution` or `/give-up`. Shows:
- Headline based on outcome:
  - `is_correct=true` → `🎉 You solved it!`
  - `is_correct=false, gave_up=false` → if `who_match=true` but `how`/`why` partial → `So close! You got the who right.` Otherwise → `Not this time — let's see the answer.`
  - `gave_up=true` → `Here's what really happened.`
- The true answer (`true_solution.who/how/why` from the LogicStructure, fetched via the existing mystery GET).
- The `explanation` paragraph (cached on `solutions.explanation`).
- A "Try another mystery" CTA back to `/`.

## 6. Data flow notes

- **Hint accounting:** `hints_used` on the `solutions` row is set at solution-create time from `count(hints WHERE mystery_id=:id)`. Useful for the reveal copy ("you solved it without any hints!" vs "you used 2 hints").
- **One solution per mystery:** `solutions.mystery_id` is unique. Re-submitting → 409. The frontend prevents this by hiding submit once a solution exists.
- **Replay UX is preserved-as-undefined** per spec PRD §12. If a kid revisits a solved mystery's URL, they go straight to RevealPanel (skip form). Out of scope for M4 to design re-play differently.

## 7. Acceptance

A kid (or stand-in user) completes a full unaided loop on iPad Safari:

1. Generate a mystery from MainScreen.
2. Read the narrative on PlaybackScreen.
3. Open the ClueTracker bottom sheet, add at least one clue in 2+ categories, edit one, delete one.
4. Tap "I think I know!" → SolutionScreen.
5. Use 1 hint, then submit a guess.
6. See the RevealPanel with explanation paragraph; the hint count is shown correctly.

Separately verified:
- A "give up" flow on a fresh mystery yields a reveal with explanation, no traceback errors.
- The 2-hint cap is enforced (third request returns 429; UI disables the button after the 2nd).
- One incorrect guess + one correct guess + one give-up all produce sensible explanation paragraphs.

## 8. Deferred and re-confirmed for later milestones

| Item | Where it lands |
|---|---|
| TranscriptPanel (audio-synced reader) | M3-audio (plan's M3.5/M3.6) |
| `audio_timestamp_ms` populated on new clues | M3-audio |
| Per-clue "jump to moment" UI | M3-audio (or v2) |
| OpenAI TTS provider + audio storage | M3-audio (plan's M3.3-new) |
| AudioPlayer component | M3-audio (plan's M3.5) |
| Error boundaries, "Switch player", responsiveness | M5 |
| Real-kid iPad smoke test, favicon, page titles | M5 |
| Per-category narrator voices | v2 |
| Hint enhancements (contextual hints from tracker, more tiers) | v2 |

## 9. Subagent-driven workflow note

M4 continues the M2/M3 pattern: per task = implementer subagent → spec compliance review → code-quality review → fix → re-review. Sonnet for both implementer and reviewers. Per `feedback_plan_text_bugs` memory: `.ts` import extensions and SDK casts in the plan's code blocks are silently fixed by the implementer.

For M4.3 specifically: the plan's code block uses `usePlaybackStore` and `playbackTime` — the implementer must remove those and pass `null` for `audio_timestamp_ms`. For ClueTracker rendering, the plan's code renders inline; the implementer must restructure to the bottom-sheet pattern described in §5 above (the spec PRD §6 describes the bottom-sheet UX in text; UI is to be built fresh against that text).
