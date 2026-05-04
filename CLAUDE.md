# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

This repo is **pre-implementation**. The only file at root is `PLAN.md` (the engineering roadmap) — no `package.json`, no source tree, no build/test commands exist yet. There is no `README.md`. Do not invent commands or pretend scaffolding exists; if a milestone hasn't landed, the artifact it produces isn't here.

`PLAN.md` is the source of truth. Read it before starting any non-trivial work — milestone definitions, agent contracts, the regeneration loop, validation rules, and acceptance criteria all live there. When implementing, cite the milestone (e.g. "M3") so future readers can map code back to the plan.

## Product (one-paragraph version)

Mysterio is an AI-generated mystery game for ages 8-13. Pick a category + difficulty → backend generates a `LogicStructure`, validates it is solvable from clues alone, writes a 700-1500 word narrative, and synthesizes audio. Kid listens, takes notes in an in-app clue tracker, submits a who/how/why guess. Audio TTS comes from ElevenLabs (Anthropic does not do TTS).

## Intended Architecture

Per `PLAN.md` §1 and §3. Future code should land in this shape unless the plan is updated first.

- **pnpm monorepo, TypeScript everywhere.** `apps/api` (Express) + `apps/web` (React + Vite) + `packages/shared` (Zod schemas and types imported by both).
- **`packages/shared` is the single source of truth for `LogicStructure` and the API DTOs.** The same Zod schemas validate Claude's JSON output on the server and form input on the client. Do not duplicate these types — drift here breaks the validation pipeline.
- **Async generation via BullMQ.** `POST /mysteries/generate` enqueues a job and returns `202` with `{mystery_id, status: "pending"}`; the frontend polls `GET /mysteries/:id` while the worker runs the orchestrator. End-to-end pipeline takes 60-120s, so synchronous HTTP is not viable.
- **Persistence:** Postgres (mysteries, users, clues, solutions; `logic_structure` lives in JSONB). S3 in prod, MinIO via docker-compose locally — `mysteries.audio_url` stores the S3 *key*, not a signed URL; the API mints fresh signed URLs per request.
- **TTS is a swappable adapter** (`services/elevenlabs/client.ts` behind a `TTSProvider` interface). Don't bake ElevenLabs assumptions into the orchestrator.

## The Generation Pipeline (the load-bearing part of the design)

Four phases, run by `services/generation/orchestrator.ts`. Two non-obvious design decisions to preserve:

1. **Logic structure is generated *and validated* before any prose is written.** A combined "write the whole mystery" prompt empirically produces unsolvable mysteries because the LLM smuggles the answer into prose without seeding clues. Phase 1 emits a structured `LogicStructure` JSON (Zod-validated); phase 2 hands a *redacted* copy (no `true_solution`, no `false_clues`, no `logic_chain`, `is_culprit`/`motive` stripped from characters) to a fresh Claude call that must deduce who/how/why from essential clues alone.

2. **Outer 3-attempt regeneration loop with failure notes feedback.** When validation fails, the comparison's human-readable `notes` string is passed back into the next logic-generation attempt as `previousFailureNotes`. The next prompt knows specifically what to fix (e.g. "the muddy boots clue wasn't decisive enough — add a clue that uniquely points to Ms. Green"). Capping at 3 attempts is deliberate; on exhaustion the mystery row is written with `validation_passed = false` and the user gets a "couldn't craft a fair mystery" UX.

`compareSolutions(guess, truth)`: exact match on character id for `who` (strict gate), Claude-based semantic grader for `how`/`why`, plus a `confidence < 0.5` floor that fails even on match.

The narrative agent has its own *inner* retry loop (max 2): a fuzzy text-match check (token-set ratio ≥ 0.75) ensures every essential clue's description appears in the prose. If any are missing, regenerate with the missing clues called out.

## Auth Posture (COPPA)

Users are 8-13 → anonymous device-id auth for the MVP. Frontend generates a UUID, stores in localStorage, sends as `Authorization: Bearer device_<uuid>`; API auto-provisions a `users` row. **Do not add email/account/social/sharing features without checking the COPPA notes in `PLAN.md` §9.** Any PII collection requires verifiable parental consent.

## Conventions to Follow When Implementing

- **Cite the milestone** in PR titles or commit messages (`M3:` prefix) so reviewers can find acceptance criteria fast.
- **Stub before real.** `PLAN.md` §M2 deliberately wires the orchestrator with stub agents that return canned data so plumbing is testable before prompts are written. Resist the urge to skip the stub phase.
- **Persist on every attempt, not just success.** Validation pass/fail and the notes string are written to `mysteries.validation_passed` / `validation_notes` regardless of outcome — the solvability suite (§8) replays validation against this corpus to catch prompt regressions.
- **Audio caching is forever.** `Cache-Control: public, max-age=31536000, immutable` — the audio for a given `mystery_id` never changes. Don't add cache-busting.
- **Solvability suite runs nightly, not on every PR** (LLM cost). Don't wire it into the per-PR CI workflow.

## Spec Gaps Already Flagged

These are open questions in `PLAN.md` §6 and §9 — surface them again rather than silently picking a direction:

- Auth flow (anonymous device-id is the MVP recommendation, not a final decision).
- Whether narrative uses Sonnet or Opus (5× cost difference).
- Voice consistency across categories (one narrator vs per-category voices).
- Hint system (likely needed for Hard mode at the lower end of the age range; deferred to v2).

## Commands

None yet — the repo has no `package.json`. Once M0 lands, the expected entry points (per `PLAN.md` §M0 acceptance criteria) are `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm migrate`. Update this section when they actually exist.
