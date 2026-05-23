# Mysterio — Session State (M2 + partial M3 + M4 + M5a + M5b + M6 shipped — paused 2026-05-17)

> M2 + M3.1/M3.2-new + M4 + M5a + M5b shipped. **M6 (reduce info leakage + multi-choice solve) shipped 2026-05-17. 9 commits land M6: parseAnnotations accepts false-clue ids (kid can't tell essential from false by pill formatting), narrative prompt instructs LLM to wrap both, role visuals collapsed on client (BriefingCard + AnnotatedNarrative + CharacterPicker — all non-detective characters now use a single 🤔 emoji + red color, no Suspect/Witness/Bystander labels), LogicStructure schema gains how_distractors[3] + why_distractors[3] with 4 superRefine invariants + 4 tests, LogicStructure prompt instructs LLM to generate plausible-but-wrong distractors, new GET /solve-options endpoint returns characters (no role) + shuffled how_options[4] + why_options[4], submit-solution replaces runGrader with === string compare (saves ~5s + $0.005/submit), new multi-choice GuessForm with OptionPicker for HOW/WHY.** Local Playwright + curl verification confirms end-to-end: 2 fresh gens produced 3 distinct distractors per field, false clue annotated alongside essentials, /solve-options returns expected shape, tap-through with correct answers yields ✓ Correct with 853-char explanation. Deployed; prod fresh gen ready in single attempt with 4 characters + 4 how_options + 4 why_options. **iPad walkthrough on M5b + M6 still pending the user.** Audio (M3.3-new) still deferred. **Tuning concern flagged from M6.8:** some why_distractor sets name the culprit in all 4 options (M6.5 prompt didn't constrain "use same naming style across true + distractors"), making the WHO trivially derivable. Easy follow-up tuning commit; not a blocker for ship.

## Milestone re-sequencing (decided 2026-05-16 mid-session)

Original plan was M2 → M3 (narrative+audio) → M4 (clue tracker+solve) → M5 (hints+polish). After M3.2-new shipped real narrative, the user pivoted to **validate the read/solve/hint experience on iPad before investing in TTS**. New sequence:

1. ✅ M2 (logic + validation regen loop) — done, deployed
2. ✅ M3.1 + M3.2-new (narrative agent + orchestrator wiring) — done, deployed
3. **➡️ M4 (clue tracker + solve + hints)** — planned, ready for fresh-session implementation
4. M3.3-new through M3.6 (TTS provider + storage + orchestrator wiring + AudioPlayer + TranscriptPanel) — deferred until M4 lands and is validated on iPad
5. M5 (polish: error boundaries, responsiveness, favicon, real-kid smoke test) — slimmer than original (hints already absorbed into M4)

Design doc for the M4 pivot: `docs/superpowers/specs/2026-05-16-m4-with-hints-design.md` (approved 2026-05-16).

## Where we are

- **Branch:** `feat/mysterio-implementation` (off `main`). 22+ commits on top of the M1.17 close-out (`12d60a5`). Not merged or PR'd.
- **Last commit:** `1bde79c` — M4-design spec doc (+ new commit when M4 plan lands).
- **Live URL:** `https://panther-golem.exe.xyz/` — **runs M3.2-new (real narrative, no audio).** Last deploy 2026-05-16.
- **Plan to execute next:** `docs/superpowers/plans/2026-05-16-m4-implementation.md` — 7 implementation tasks (M4.1-M4.7) + M4.8 verification-only.
- **Original PLAN.md:** `docs/superpowers/plans/2026-05-04-mysterio-implementation.md` — still useful as code reference (M4 plan lifts most of its code from there).
- **Spec PRD:** `docs/superpowers/specs/2026-05-04-mysterio-prd.md`.
- **Execution mode:** subagent-driven. Model: **sonnet** for both implementer and reviewer subagents (per `workflow_model_selection` memory).

## M2 completed (M2.1 – M2.8 + two pre-M2.4 prep commits)

| Task | Commits | Notes |
|---|---|---|
| M2.1 LogicStructure Zod schema | `9854cd6` + `2937d15` + `080254a` | superRefine for 4 cross-field rules; review caught `category` widening to `string` (cast bug); +M2.1 follow-up to derive `LogicStructure` from `z.infer` so the dual definitions can't drift |
| M2.2 Anthropic SDK wrapper | `455fc32` + `200ed44` + `d1802b2` | review caught silent cache-miss: `cache_control` on system blocks isn't in main endpoint's `TextBlockParam` in SDK 0.32.1; switched to beta endpoint; then bumped SDK to 0.96.0 (caching GA on main endpoint) — see "SDK bump rationale" below |
| M2.3 retry / redact / textMatch | `c269153` + `57de31a` | review caught mutable-alias on `prevErrors` (now `readonly string[]`), silent no-op for `maxAttempts=0` (throws now), missing positive-shape redact test, loose `tokenSetRatio` assertion |
| M2.4 logicStructureAgent + prompts | `2632214` + `7ea3792` | review caught per-difficulty clue-count not enforced by Zod schema → added agent-side `checkDifficultyCounts` after `safeParse`; also: stop dropping `lastError` when `previousFailureNotes` is set; exhaustion returns most-recent error only (not concat-of-3); type-only `ZodError` import |
| M2.5 validationAgent | `d81c17b` + `2079e02` | review caught: Zod error path dropped (regression vs M2.4) → extracted shared `apps/server/src/services/generation/zodFormat.ts` `formatZodIssues` used by both agents; `validationGuessSchema` exported for M2.6 replay; character-id error now lists valid ids; added `category` to validation prompt's input-shape inventory; cached `VALIDATION_SYSTEM` (dual breakpoint with `SAFETY_PREAMBLE`) |
| M2.6 grader + compareSolutions | `4de6f52` + `9ff6457` | review caught Critical: `JSON.parse(extractJson(raw))` could throw past the Zod-only fallback in `runGrader` → wrapped in try/catch (now fail-closed for both throw and Zod paths); cached `GRADER_SYSTEM` too; `buildNotes` sanitizes quotes (defense-in-depth against model-output injection into next prompt); short-circuit grader calls when `who_match === false` to skip 2 wasted Claude calls per attempt; added `confidence === 0.5` boundary test pinning the strict `<` floor |
| M2.7 orchestrator | `4bb573b` + `08d30f5` | wires regen loop into route; deletes stub; review caught 2 Critical (unhandled rejections when `getDb`/`loadEnv` are called outside the top-level try; nested unhandled rejection if catch block's DB write itself throws) + orphan `writing` state on 2-write success path (now single atomic write since M3 hasn't split off `synthesizing` yet) + non-deterministic `validation_attempts` on exhaustion (now writes `MAX_VALIDATION_ATTEMPTS` and `validation_passed: 0`) |
| M2.8 live acceptance test | `f3836fb` | `describe.skipIf(!SHOULD_RUN)` gated on `RUN_LIVE_LLM_TESTS=1`; vitest reports it as skipped in default runs |

**Total: 17 commits.** Subagent-driven: every task = implementer → spec-review → code-quality review → fix pass → re-review. Every code-quality review found real issues. 14 unit tests green; M2.8 live test skipped by default (15 total reported).

## Pre-M2.4 architectural decisions you made

1. **`LogicStructure` derived from Zod (`z.infer<typeof logicStructureSchema>`)** — eliminates the dual-definition drift class that bit M2.1 (the `category` cast). `RedactedLogicStructure` stays hand-written because there's no underlying `redactedLogicStructureSchema` (`logicStructureSchema` is `ZodEffects` from `.superRefine`, so `.omit()`/`.pick()` don't work directly on it — see "Open architectural items" below).
2. **Bumped `@anthropic-ai/sdk` 0.32.1 → 0.96.0** — caching is GA on the main endpoint, so `client.messages.create(...)` honors `cache_control` directly. M2.2's wrapper is now on the main endpoint. The two cache breakpoints (`SAFETY_PREAMBLE` + agent-specific system) work on both validation and grader agents; logic-structure agent only caches the preamble (the difficulty-specific prompt varies per call, so caching it would be wasteful).
3. **`previousFailureNotes` architecture confirmed.** Plan's design (string arg on the logic-gen prompt, populated from `compareSolutions.notes` on validator-disagrees or `runLogicStructureAgent.error` on logic-failure or `"validation agent malfunctioned: ..."` on validator-malformed) is what M2.7 wires. No change.

## M2.8 live-test result — PASSED (2026-05-16, re-run after real key added)

Real `ANTHROPIC_API_KEY` placed in `apps/server/.env`; re-ran:
```
set -a && source apps/server/.env && set +a && \
RUN_LIVE_LLM_TESTS=1 pnpm --filter @mysterio/server test test/integration/validation-pass-rate
```

**Result: `pass-rate: 24/24 = 100.0%`** — well above the ≥85% acceptance bar. Test duration 1582s (~26 min). No prompt tuning required before M3.

Run-shape metrics (from `/tmp/mysterio-m2.8-livetest.log`):
- **151 total Claude calls** (vs. an estimated max ~288 for the corpus)
- **logicStructureAgent**: 36 attempt1, 8 attempt2, 2 attempt3 — inner Zod/difficulty-count retries fired ~10× across the run; 12 outer-attempt re-tries were enough for full pass
- **validationAgent**: 0 attempt2s — validator JSON shape never malformed
- **Token usage**: 125,266 input + 82,263 output ≈ $1.60 on Sonnet 4.5
- **`cache_read_input_tokens`: 0 across every call** — **confirms** the M2.5 reviewer's concern (see "Open architectural items" below) that `SAFETY_PREAMBLE` alone (~150 tokens) is below Anthropic's minimum cacheable prompt-cache breakpoint size on Sonnet/Opus 4.x. This was a theoretical risk in M2.5; the live run elevates it to a real, validated issue. Fix shape: concatenate `SAFETY_PREAMBLE` + agent-specific system block into a single cached block so each agent's cached portion exceeds the minimum threshold. Not a correctness bug — just leaving Sonnet caching savings on the table. Pre-M3 nice-to-have, not a blocker.

## Open architectural items for M3 onward

Surface these before they bite:

- **`redactedLogicStructureSchema` for M2.5 replay**: `logicStructureSchema` is `ZodEffects` (because of `.superRefine`), so `.omit()` / `.pick()` don't work on it directly. If M3 or M2.8 ever wants to *parse* a redacted blob (e.g., replay validation against persisted rows), it has no schema. Fix shape: split `schemas/logicStructure.ts` so the inner `ZodObject` (before `.superRefine` chain) is saved as a named export `logicStructureObjectSchema`, then both `logicStructureSchema = logicStructureObjectSchema.superRefine(...)` AND `redactedLogicStructureSchema = logicStructureObjectSchema.pick({category: true, setting: true, characters: ..., essential_clues: true})` (with a separate `Pick<Character, ...>`). Not a blocker for M2 acceptance.
- **`SAFETY_PREAMBLE` size and Anthropic's minimum cacheable token threshold**: M2.5 code-reviewer flagged that the preamble is ~150 tokens, which may fall below the minimum prompt-cache size for Claude 3.x / 4.x (≥1024 tokens for some models). When you run M2.8 live, check that `cache_read_input_tokens` is non-zero on attempts 2-3 within the same 5-minute window. If always zero, the preamble alone is too small to cache; concatenate `SAFETY_PREAMBLE` + difficulty/system prompts into a single cached block per-agent.
- **Stale `previousFailureNotes` on validator malfunction**: when the validator agent itself returns `!ok` (malformed JSON twice), the orchestrator sets `previousFailureNotes = "validation agent malfunctioned: ..."` and the next outer attempt's logic-gen sees that as the "previous failure." But the previous logic was fine. Architectural trade-off — accept for M2, consider in M3 whether to clear notes on malfunction vs. retry only the validator.
- **`validation_history` column** for M2.8 corpus replay: today `mysteries.validation_notes` only reflects the LAST attempt's notes. A separate table or JSONB array column would let the solvability suite replay validation per-attempt. Cheap to add now while the schema is young.

## M2 deploy to `panther-golem.exe.xyz` — DONE (2026-05-16)

- Real `apps/server/.env` scp'd to VM (`-rw------- exedev`); root `.env` left as placeholder (only used for `deploy.sh` existence check).
- `bash scripts/deploy.sh` ran clean (rsync → install → migrate → systemd restart).
- **Bug discovered + fixed mid-deploy**: `packages/shared/package.json` exported `./src/index.ts` for `main`/`types`/`exports`. That works in dev (tsx resolves `.ts`), but production Node crashes with `ERR_UNKNOWN_FILE_EXTENSION` because the compiled server imports `@mysterio/shared` and Node tries to load the `.ts` source. Fix: exports now point at `./dist/index.js` / `./dist/index.d.ts`; added `dev: "tsc -p tsconfig.json --watch --preserveWatchOutput"` to shared; root `pnpm dev` now includes `--filter @mysterio/shared`. This unblocks the dev workflow too (watch-build of shared keeps `dist/` fresh for both tsx and node-prod consumers).
- Live smoke test confirmed: `POST /api/mysteries/generate {player_id:"p1", category:"missing-pet", difficulty:"easy"}` → 202 with `mystery_id` → polled `GET /api/mysteries/:id` → status flipped pending → generating_logic → ready in ~30s. Real characters generated (5 characters with kid-appropriate descriptions). `narrative_text` is the M3 placeholder string; `audio_url` is null. Title is `"Mystery at The mystery takes"` — the `makePlaceholderTitle` slicer in orchestrator.ts:102-105 takes the first 3 words of `setting`, so kids-of-string-slicing artifacts are expected until M3 replaces with a real LLM-generated title.

## Carry-forward open items from M1.17 (still open)

- **Consolidate to one `.env` file.** Still two `.env`s on disk — only `apps/server/.env` is used by the running server. Root `.env` is only required by `scripts/deploy.sh`'s existence check.
- **VM bootstrap script.** Still no `scripts/bootstrap-vm.sh` — re-provisioning is ad-hoc.
- **Rename `deploy` npm script** to avoid colliding with pnpm's built-in `deploy` subcommand. Hit again on this deploy; worked around by `bash scripts/deploy.sh` directly. Worth fixing — rename to `deploy:vm` or similar.
- **`systemctl --user` warning** under non-login SSH (`XDG_RUNTIME_DIR` not set). Hit again; workaround is to prefix `XDG_RUNTIME_DIR=/run/user/$(id -u)` for systemctl/journalctl over non-login ssh.

## Repo state on disk

- `apps/server/src/services/generation/`:
  - `orchestrator.ts` — wires logic+validation regen loop into the route (M2.7)
  - `redact.ts`, `textMatch.ts`, `retry.ts` — utilities (M2.3)
  - `zodFormat.ts` — shared `formatZodIssues` (M2.5 fix pass)
  - `compareSolutions.ts` — strict-who + parallel grader for how/why + confidence floor + sanitized notes (M2.6)
  - `compareSolutions.test.ts` — 6 tests pass (5 + 1 confidence-0.5 boundary)
  - `agents/logicStructureAgent.ts` (M2.4), `validationAgent.ts` (M2.5), `graderAgent.ts` (M2.6)
  - `prompts/shared.ts` (`SAFETY_PREAMBLE`), `logicStructure.system.ts` (per-difficulty), `validation.system.ts`, `grader.system.ts`
- `apps/server/src/services/stub/` — deleted in M2.7.
- `apps/server/src/services/anthropic/client.ts` — bumped to SDK 0.96.0, uses `client.messages.create` with `cache_control` on system blocks (M2.2 + M2.2 bump).
- `apps/server/src/routes/mysteries.ts` — POST `/generate` now calls `void runGeneration(...)` instead of the deleted `startStubGeneration`.
- `apps/server/test/integration/validation-pass-rate.test.ts` — M2.8 live test (skipped by default).
- `packages/shared/src/types/logicStructure.ts` — types derived from Zod via `z.infer`.
- `packages/shared/src/schemas/logicStructure.ts` — `logicStructureSchema` with 4 superRefine cross-field rules; no longer exports `LogicStructureZ` (consolidated to single `LogicStructure`).
- `packages/shared/src/schemas/logicStructure.test.ts` — 6 tests pass (added ghost-character + message-pinning + positive-shape assertions after review).

## Pre-M3 verification steps — STATUS

1. **M2.8 live acceptance test: PASSED 24/24 = 100.0%** on 2026-05-16 after real key added. See "M2.8 live-test result" above.
2. *(Not run yet)* End-to-end smoke test: `pnpm --filter @mysterio/server dev`, then `curl -X POST .../api/mysteries/generate ...`, watch DB transitions. Now unblocked — key works.
3. *(Not run yet)* Re-deploy to `panther-golem.exe.xyz` via `scripts/deploy.sh`. Deploy will need a real `ANTHROPIC_API_KEY` populated in the VM's `apps/server/.env` too (only the local `.env` has the key right now).

## VM state (panther-golem.exe.xyz)

Updated 2026-05-16:
- Linger=yes, Node v22.11.0, Corepack 0.34.7, pnpm@9.12.0.
- exe.dev proxy on port 3000, public.
- mysterio.service running the **M3.2-new build** (real narrative; null audio). Last deploy 2026-05-16.
- `apps/server/.env` on VM has real ANTHROPIC + OPENAI keys. Root `.env` still placeholder (only used for `deploy.sh` existence check).

## Original M4 plan reference (pre-execution)

**Plan file:** `docs/superpowers/plans/2026-05-16-m4-implementation.md`. Read it end-to-end before starting.
**Design spec:** `docs/superpowers/specs/2026-05-16-m4-with-hints-design.md`. Read for context if needed.

**Goal:** Add clue tracker (bottom-sheet drawer on PlaybackScreen), solve flow (SolutionScreen with picker + form + reveal), and two-tier hint system (≤2 hint nudges + give-up). All audio dependencies deliberately deferred — no `usePlaybackStore`, no `TranscriptPanel`, `audio_timestamp_ms` always null. **First task: M4.1 (shared Clue/Solution/Hint types).**

**Decisions baked in (don't re-litigate):**
- **Hint design = spec PRD as-is**: ≤2 nudges + 1 give-up, all on SolutionScreen, server-enforced cap.
- **ClueTracker = bottom-sheet drawer** (per design spec §5; user picked layout B in brainstorming).
- **Audio decoupling**: `audio_timestamp_ms` stays in the Zod schema as optional, ClueTracker omits it from POST body, column persists `null`.
- **TranscriptPanel deferred**: PlaybackScreen keeps existing prose div.
- **explanationAgent (M4.4) and hintAgent (M4.6)**: both fail-soft. Try/catch wraps BOTH the Claude call AND the JSON.parse so a malformed LLM response can't crash uncaught (per M2.6 reviewer's catch-pattern).
- **Endpoint paths** match plan's existing frontend code: `/submit-solution`, `/give-up`, `/solution`, `/hints`.

**Resume checklist:**
1. `git status` — should be clean after the M4-design + M4-plan commits land.
2. `git log --oneline 12d60a5..HEAD` — confirm M2 (17 commits) + post-M2 (2 commits) + M3.1 + M3.2-new + M4-design + M4-plan commits.
3. M2.8 live acceptance: **DONE, PASSED 24/24**. M3 narrative + orchestrator wiring: **DONE, deployed**.
4. M4 plan: **READY** — `docs/superpowers/plans/2026-05-16-m4-implementation.md`. 7 implementation tasks + 1 verification task (M4.8).
5. `Skill('superpowers:subagent-driven-development')` to begin Task M4.1.
6. Use **sonnet** for implementer + reviewer subagents (per `workflow_model_selection` memory).
7. After M4.7 lands, run M4.8 (deploy + iPad smoke test) before moving to M3.3-new (OpenAI TTS).

**Key things the implementer must NOT do (per design spec §8 + memory):**
- Add `usePlaybackStore`, `useAudioPlayer`, or any audio-store dep.
- Pull `TranscriptPanel` forward — keep current PlaybackScreen prose div.
- Add `audio_timestamp_ms` to the createClue client call.
- Skip the M2.6-pattern try/catch on hintAgent + explanationAgent (both Claude call AND JSON parse must be inside the try).
- Skip the per-task spec compliance review + code quality review subagent pair (every M2/M3 reviewer found a real bug).

## M4 completed (M4.1 – M4.8 + 1 carry-forward fix, 2026-05-16)

| Task | Commits | Notes |
|---|---|---|
| M4.1 shared Clue/Solution/Hint types | `8df75e3` | plain TS interfaces (no Zod); row-shape mirrors snake_case columns |
| M4.2 clues router (CRUD) | `4376c6b` + `42f0984` | review caught cross-mystery clueId access: PATCH/DELETE used only `clueId` in WHERE, allowing edits of another mystery's clues; fix adds `and(eq(clues.id), eq(clues.mystery_id))` to both UPDATE and read-back SELECT |
| M4.3 ClueTracker bottom-sheet UI | `b0ab1d6` + `3a59154` | review caught 3 issues: ClueEditor draft state never re-synced after refetch (stale text on Edit-after-Save); both inputs missed `fontSize: 16` triggering iPad Safari auto-zoom; Enter-key add didn't check `createM.isPending`, allowing duplicate POSTs from rapid mashing |
| M4.4 solutions endpoints + explanationAgent | `488578f` | grader-backed who/how/why match, M2.6-style fail-soft on explanation (try/catch around BOTH claudeText AND JSON.parse); GET /solution returns 200+null for unsolved (intentional — frontend's `solution !== null` check handles it; M4.5 designed against this contract) |
| M4.5 SolutionScreen UI | `cb7cff7` + `e4d6783` | review caught iPad Safari textarea auto-zoom (`fontSize: 16` on both textareas), brief double-submit race (`refetch()` → `qc.setQueryData` for synchronous transition), missing `aria-label` on textareas; M4.7 was instructed to preserve setQueryData over plan-text's refetch regression |
| M4.6 hintAgent + hints endpoint | `547bf2a` | 2-cap enforced at route; POST 409 ordering (mystery_not_ready → already_solved → hint_limit_reached); fail-soft hintAgent with FALLBACK string |
| M4.7 HintControls on SolutionScreen | `4e78162` | nudge button + 2-step give-up confirm; preserved M4.5-fix's setQueryData pattern (didn't regress to refetch as plan-text would have) |
| M4.8 prep: SPA fallback fix | `eb6db7b` | carry-forward bug from M1.10: both static registrations had `decorateReply: false`, so `reply.sendFile` was never decorated → notFoundHandler crashed on every direct URL hit to `/mysteries/*`. Fixed by removing `decorateReply: false` from the audio registration (first registration decorates per fastify-static rule). |

**Total: 11 commits.** Subagent-driven: every task = implementer → spec-review → code-quality review → fix → re-review. Pattern continues to pay — code-quality reviewer found a real Important/Critical issue in M4.2, M4.3, M4.5 (each ≥1 fix-pass commit landed). M4.4, M4.6, M4.7 passed code-quality with no required fixes.

## M4 acceptance verification (2026-05-16)

**Local end-to-end smoke (live LLM, real mystery `x3ag3dj9juc0`):**
- ✅ Add 2 clues across 2 tabs, edit one, delete one — verified via curl
- ✅ Request 1 hint (`remaining=1`), 2nd hint (`remaining=0`, different essential clue), 3rd POST → 409 `hint_limit_reached`
- ✅ Submit CORRECT solution with all 3 fields → `is_correct=1`, all match flags = 1, `hints_used=1`, 785-char kid-friendly explanation
- ✅ Resubmit → 409 `already_solved`
- ✅ Give-up on second mystery → `gave_up=1`, all guess fields null, 765-char explanation; resubmit → 409
- ✅ All 11 M4 commits build + typecheck + tests clean (14 passed + 1 skipped throughout)

**Pre-existing bug discovered during M4.8 deploy:** `apps/server/src/routes/static.ts` had both fastify-static registrations set to `decorateReply: false`, so `reply.sendFile` was never added to the reply prototype. Every direct URL hit to a React Router path (e.g., `/mysteries/abc/solve`) crashed with 500. Pre-existing since M1.10 (`a14162f`), but would bite the M4.8 iPad smoke since kids refreshing mid-flow would see a hard error. Fixed in `eb6db7b` and redeployed; SPA fallback now works on prod.

**Deploy:** `bash scripts/deploy.sh` ran clean (3m wall, build + rsync + install + migrate + systemd restart). Service running, `/api/health` returns `{"ok":true,"db":true}`, `/mysteries/abc/solve` now serves index.html (was 500), all API endpoints respond.

**iPad smoke (M4.8 step 2) — STILL PENDING.** Controller-driven walkthrough on a real iPad against https://panther-golem.exe.xyz/ is the next user-driven step before moving to M3.3-new (TTS). The 12-step kid-loop checklist is in `docs/superpowers/plans/2026-05-16-m4-implementation.md` M4.8 step 2.

## Open/deferred items flagged during M4

These were called out by reviewers + judgment-called as out-of-scope-for-now:

- **`solutions.ts` POST hints race window:** prior-count SELECT → runHintAgent (~3-5s) → INSERT is wider than M4.2's clue race. Two concurrent POSTs both pass `prior.length < MAX_HINTS` and both INSERT → 3 hints possible. Accepted for single-device MVP. `Math.max(0, ...)` in GET prevents `remaining` from going negative.
- **`hints.ts` post-INSERT SELECT is superfluous** (re-reads the row to pick up `created_at`); introduces a latent `undefined` type hole on the return path. Reviewer suggested constructing the response inline. Deferred — not blocking M4.7.
- **No mutation error UI** anywhere in M4 (no toasts on createClue / askHint / giveUp / submitSolution failures). Frontend silently swallows API errors. Plan is fail-soft (retry by user action). Worth adding in a future hardening pass.
- **`CLUE_TABS` import path from sibling screen** (`ClueSummary.tsx` imports `../PlaybackScreen/ClueTracker/ClueCategoryTabs.js`). Cross-screen coupling. Move to `@mysterio/shared/constants` when next touched.
- **`HintAgent` may name the culprit** if the LLM breaks the soft "never say a character's name if they're the culprit" rule in `hint.system.ts`. No server-side check today. Add post-processing in `hintAgent.ts` (between safeParse and return) before Hard mode ships:
  ```ts
  if (parsed.success && parsed.data.hint.toLowerCase().includes(ls.true_solution.who_did_it.toLowerCase())) return FALLBACK;
  ```
- **`runExplanation` is called inline on the submit-solution / give-up path** — adds ~3-5s to the POST. Frontend shows "Checking..." spinner; acceptable. Could parallelize with the grader pair in a future refactor (outcome is the only dep, and outcome can be computed without explanation).
- **Cache-miss on Sonnet still present** (SAFETY_PREAMBLE alone is below the minimum cacheable threshold). Not flagged anew in M4 — already a tracked pre-M3 nice-to-have.

## M5a completed (2026-05-17) — kid-onboarding (identity + briefing)

Triggered by 10yo daughter playtest feedback on the M4 build. 7 commits on `feat/mysterio-implementation`:

| Task | Commits | Notes |
|---|---|---|
| M5a.1 player-name detective + LogicStructure rule | `df3b028` + `5af7427` | review caught: detective invariants ("exactly one", "never the culprit") were enforced only by prompt instruction; promoted to `superRefine` checks alongside the existing culprit checks, +2 tests pin them |
| M5a.2 MainScreen hero greeting | `56fd950` + `9d952e8` | review caught "Detective Detective 🕵️" flash during query-load window (default fallback was literal "Detective"); empty-string fallback collapses to "Detective  🕵️" then resolves |
| M5a.3 BriefingCard + PlaybackScreen gate | `a35c6bf` + `905a9ef` | review caught (1) locked-room emoji 🔐 didn't match CategoryGrid's 🔒; (2) cast roster order was non-deterministic — added ROLE_ORDER priority map (suspect → witness → bystander) |
| M5a.4 live LLM verification | none (verification only) | 2 fresh local gens both single-attempt success; detective name = player name for both; Playwright snapshot of MainScreen hero + BriefingCard cast roster confirms render |
| M5a.5 deploy + iPad handoff | none (deploy only) | `bash scripts/deploy.sh` clean; remote spot-check: 1st gen failed at narrative_clue_coverage (existing M3.1 stochastic issue, not M5a regression) but detective name still landed; 2nd gen succeeded end-to-end |

**Total: 7 commits.** Subagent-driven (sonnet for implementer + reviewer) per `workflow_subagent_driven`. Code-quality reviewer found a real bug in 3/3 implementation tasks (M5a.1 schema gap, M5a.2 UX flash, M5a.3 icon mismatch + role-sort) — the two-stage review pattern continues to pay.

## M5a design + plan + memory artifacts

- Design: `docs/superpowers/specs/2026-05-17-m5-kid-onboarding-design.md` — covers M5a (shipped) + M5b (queued)
- Implementation plan: `docs/superpowers/plans/2026-05-17-m5a-implementation.md` — 5 tasks
- Brainstorming visual artifacts: `.superpowers/brainstorm/91398-1778981903/content/` (hero-treatments, briefing-card, highlight-styles, tap-detail-behavior)
- Local Playwright screenshots: `.playwright-mcp/m5a-main-hero.png`, `.playwright-mcp/m5a-briefing-card.png`

## M5b completed (2026-05-17) — annotated narrative + auto-Notes

15 commits on `feat/mysterio-implementation`:

| Task | Commits | Notes |
|---|---|---|
| M5b.1 DB migration | `1020c47` | drizzle-kit recreate-table workaround for CHECK; manual patch of generated INSERT to use literal 'manual'/NULL for new columns (drizzle-kit bug on SQLite add-column-with-CHECK). 4 files. |
| M5b.2 shared types | `61672f0` | NarrativeAnnotation interface, ClueSource type, Clue.source/annotation_id additions. |
| M5b.3 parseAnnotations util + 9 tests | `654a18f` | Pure regex walker; drops invalid ids + detective ids; computes offsets in clean text. TDD-followed. |
| M5b.4 narrative prompt + agent integration | `b3f4687` + `48591ff` | ANNOTATION RULES section in narrative.system.ts. Agent parses tags internally; coverage check runs on clean text. **Fix-pass:** `redactForNarrative` now strips `is_culprit` + `motive` from characters (was leaking the answer to the LLM; safe under prompt rules but the new tag surface made the leak load-bearing). |
| M5b.5 orchestrator + routes | `645c07d` + `105cadc` | Orchestrator persists annotations; mysteries GET returns them; clues POST accepts source+annotation_id with dedupe (200 on re-tap, 201 on insert). **Fix-pass:** added guard after read-back SELECT so 201+undefined can't be returned to client. |
| M5b.6 AnnotatedNarrative component | `1fec2cd` + `29cc3a3` | Pill rendering with role-color background; `type="button"`; ReactNode type imported explicitly; suspect color aligned to `var(--bad)` matching BriefingCard. |
| M5b.7 ClueTracker focused-mode + ClueEditor ✨ badge | `c684e19` + `dd65595` | useEffect deps use stable scalars (`[focusedClueId, cluesQ.dataUpdatedAt]`) so the drawer opens reliably even when the cluesQ refetch is still in flight. `CSSProperties` imported explicitly. |
| M5b.8 PlaybackScreen wiring | `2bcb20c` + `424bd74` | Tap → auto-create clue with composite annotation_id (`p-<id>` / `c-<id>`); on success, focus the new row in ClueTracker. Inline polish: server-dedupe comment + onError logger. |
| M5b.9 live verification | none (verification only) | 2 fresh local gens both produced 7 annotations (4 persons + 3 clues). Tap-add flow verified via Playwright: tap → drawer opens focused on auto-added row with ✨ badge + rich content. Curl-level dedupe: 1st tap 201, 2nd tap 200 with same clue id. |
| M5b.10 deploy + iPad handoff | (this commit) | `bash scripts/deploy.sh` clean; remote schema confirms 2 new columns + unique partial index; first prod gen hit M3.1 narrative_clue_coverage stochastic failure but second gen succeeded with 7 annotations + correct detective name. iPad smoke pending user. |

**Total: 15 commits.** Subagent-driven (sonnet for implementer + reviewer). Code-quality reviewer found a real bug in 7/8 implementation tasks — the two-stage review pattern continues to pay (caught: drizzle-kit SQL bug, schema invariants, `is_culprit` leak, SELECT-after-INSERT guard, suspect color mismatch, React import fragility, effect-dep object-identity bug, focusedClueId race).

## M5b design + plan + memory artifacts

- Design: `docs/superpowers/specs/2026-05-17-m5-kid-onboarding-design.md` § M5b
- Implementation plan: `docs/superpowers/plans/2026-05-17-m5b-implementation.md` — 10 tasks
- Local Playwright screenshot: `.playwright-mcp/m5b-annotated-narrative.png` (drawer-focused-on-Priya snapshot)

## iPad smoke checklist for the user (M5b + M6)

Live at https://panther-golem.exe.xyz/

1. Pick a player; generate a fresh Easy missing-pet mystery; wait ~90s for ready.
2. Tap "📖 Start the story" on the BriefingCard. Confirm the "You'll meet" roster shows ONLY names (no suspect/witness/bystander labels) — every non-detective is just "🤔 Name". **M6.3.**
3. Confirm the narrative has MORE gold pills than M5b — false clues are also highlighted; you can't tell essential from false by looking. All non-detective people are the same red color (no role leak via pill color). **M6.1 + M6.2.**
4. Tap a person pill (e.g. "Oliver") — drawer slides up, switches to Characters tab, the row has ✨ + yellow outline + the character's role + description. **M5b.7.**
5. Edit the row, add a personal note ("I think he did it").
6. Tap the SAME person pill again — drawer reopens focused on the same row (no duplicate, edit preserved). **M5b.5 dedupe.**
7. Tap a CLUE pill — drawer switches to Notes tab, focuses the new ✨ row with the clue text.
8. Tap backdrop to collapse drawer.
9. Tap "I think I know!" → SolutionScreen loads.
10. Confirm WHO is a button grid of 🤔 + name (no role text under any name). **M6.3.**
11. Confirm HOW + WHY are vertical button rows of 4 options each (no textareas). **M6.7.**
12. Tap a suspect, tap a HOW option, tap a WHY option, then Submit. RevealPanel renders with the badge + 100-150 word explanation. **M6.6 === grader.**
13. On a second fresh mystery, try give-up — RevealPanel renders the gave-up badge.

Known tuning concern from M6.8 verification: in some mysteries the why_distractors all name the culprit by name, which makes the WHO trivially derivable from reading the WHY options. Easy follow-up: tighten M6.5 DISTRACTOR OPTIONS prompt to constrain "use the same naming style (named-by-character OR generic 'the person') across the true + 3 distractors so the kid can't pattern-match by name frequency."

## Notes for the next session

- Code-quality review found 9 real bugs across M2 (1 silent cache-miss, 1 unhandled JSON.parse, 2 unhandled rejections in orchestrator, plus 4-5 quality regressions and 1 data-quality issue in `validation_attempts` semantics). Every one of those would have been caught in production differently and more expensively. The two-stage review pattern keeps paying.
- Subagent prompts continue to inline full task text from the plan. Don't try to point at the plan file from the prompt — the plan-text inheritance + the project context together are what makes a single-shot implementer succeed.
- For M3, the plan-text bugs to expect (based on the M2 pattern): `.ts` extensions in imports; possibly `interface ... | ...` syntax errors; potentially out-of-date SDK or library snippets given the SDK bump moved a fair amount.
- Plan deviations the implementer is authorized to make silently: `.ts→.js` import extension; SDK cast hacks that no longer apply on the bumped version (M2.2 dropped one); plan-text TypeScript syntax errors that don't compile.
- Cost reality: M2.8 running 24 generations × ~3 attempts × ~3-4 calls/attempt = up to ~288 Claude calls. Some succeed in 1 attempt (≤4 calls); pass-rate on the corpus should be ≥85% per plan acceptance. Watch the actual cost in the test summary.
- The user prefers a structured checkpoint at major milestone boundaries (M2.4 prep was such a moment in this session). Not between every task.
