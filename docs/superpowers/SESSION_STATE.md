# Mysterio — Session State (M2 complete, paused 2026-05-16)

> M2 done. Real logic-gen + validation regen loop wired into `/generate`; orchestrator replaces the M1 stub. Narrative + audio are placeholders — those land in M3. Re-invoke `superpowers:subagent-driven-development` when resuming.

## Where we are

- **Branch:** `feat/mysterio-implementation` (off `main`). 17 M2 commits on top of the M1.17 close-out (`12d60a5`). Not merged or PR'd.
- **Last commit:** `f3836fb` — M2.8 live LLM acceptance test (skipped by default; user ran it manually after the commit landed — see "M2.8 live-test result" below).
- **Plan in flight:** `docs/superpowers/plans/2026-05-04-mysterio-implementation.md`.
- **Spec:** `docs/superpowers/specs/2026-05-04-mysterio-prd.md`.
- **Live URL:** `https://panther-golem.exe.xyz/` — currently still running M1.17 (stub). M2 NOT yet redeployed.
- **Execution mode:** subagent-driven (skill `superpowers:subagent-driven-development`). Model: sonnet for every M2 task (per pre-session note about the model bump from haiku — schema/agent work needs real judgment).

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

Unchanged since M1.17 close-out:
- Linger=yes, Node v22.11.0, Corepack 0.34.7, pnpm@9.12.0.
- exe.dev proxy on port 3000, public.
- mysterio.service running M1.17 build (stub). Re-deploy needed for M2.

## Next session — start at M3

M3 goal (per plan §M3): replace the placeholder narrative + title with a real `narrativeAgent` that turns a validated `LogicStructure` into a 700-1500 word children's mystery, and a real `ttsAgent` that synthesizes audio. Section 5 of `PLAN.md` covers ElevenLabs vs OpenAI TTS (CLAUDE.md notes the project picked OpenAI TTS — verify in `env.ts` which is already wired).

M3 acceptance (per plan): `/generate` produces a real audible MP3 for all 8 categories at all 3 difficulties; every essential clue text-matches into the narrative (`tokenSetRatio` ≥ 0.75 via `findMissingClues` from M2.3).

First task: **M3.1 narrative system prompt + agent** (plan line ~3811). Subsequent: M3.2 essential-clue text-match retry, M3.3 TTS agent + S3/MinIO storage, M3.4 wire into orchestrator, M3.5 frontend playback verification.

**M3 decisions taken at start (2026-05-16):**
- **TTS provider: OpenAI** (env.ts already wired with `OPENAI_TTS_MODEL=tts-1-hd`, `OPENAI_TTS_VOICE=fable`). Implementer should build `services/openai/tts.ts` behind the `TTSProvider` interface (per CLAUDE.md swappable-adapter posture); ignore PLAN.md §M3.3's `services/elevenlabs/client.ts` literal — the *interface* and storage flow apply, only the provider differs.
- **Narrative model: Sonnet 4.5** (same as M2 agents). Build the agent so model is configurable in one place; revisit only if essential-clue text-match retries fire frequently or narrative quality reads flat in M3.5 manual playback.
- **Narrator voice strategy: single voice (`fable`) across all 8 categories.** Per-category voices is v2 work; CLAUDE.md flags it as a known spec gap.

**Resume checklist:**
1. `git status` — should be clean after the two post-M2 commits (M2-post fix + SESSION_STATE update).
2. `git log --oneline 12d60a5..HEAD` — confirm 17 M2 commits + 2 post-M2 commits.
3. M2.8 acceptance test: **DONE, PASSED 24/24** on 2026-05-16. M3 prompt-tuning gate cleared.
4. M2 VM deploy: **DONE** at `https://panther-golem.exe.xyz/`; live smoke generation tested end-to-end.
5. `Skill('superpowers:subagent-driven-development')` for M3.1 work.
6. Sonnet for the implementer subagents (M3 has real prompt-design + agent code).

## Notes for the next session

- Code-quality review found 9 real bugs across M2 (1 silent cache-miss, 1 unhandled JSON.parse, 2 unhandled rejections in orchestrator, plus 4-5 quality regressions and 1 data-quality issue in `validation_attempts` semantics). Every one of those would have been caught in production differently and more expensively. The two-stage review pattern keeps paying.
- Subagent prompts continue to inline full task text from the plan. Don't try to point at the plan file from the prompt — the plan-text inheritance + the project context together are what makes a single-shot implementer succeed.
- For M3, the plan-text bugs to expect (based on the M2 pattern): `.ts` extensions in imports; possibly `interface ... | ...` syntax errors; potentially out-of-date SDK or library snippets given the SDK bump moved a fair amount.
- Plan deviations the implementer is authorized to make silently: `.ts→.js` import extension; SDK cast hacks that no longer apply on the bumped version (M2.2 dropped one); plan-text TypeScript syntax errors that don't compile.
- Cost reality: M2.8 running 24 generations × ~3 attempts × ~3-4 calls/attempt = up to ~288 Claude calls. Some succeed in 1 attempt (≤4 calls); pass-rate on the corpus should be ≥85% per plan acceptance. Watch the actual cost in the test summary.
- The user prefers a structured checkpoint at major milestone boundaries (M2.4 prep was such a moment in this session). Not between every task.
