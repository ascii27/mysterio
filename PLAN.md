# Mysterio — Implementation Plan

An interactive AI-generated mystery story game for ages 8-13. Users pick a category and difficulty, listen to a Claude-generated narrative read aloud by TTS, take notes in an in-app clue tracker, then submit a who/how/why solution.

This document is the engineering roadmap. It assumes the spec in `README.md` (or the original brief) is the source of truth for product requirements; this plan addresses *how* to build it.

---

## 1. Repository Layout

A pnpm + TypeScript monorepo with workspaces. This keeps a single `tsconfig` chain, lets the frontend import shared Zod schemas/types from the backend without duplication, and makes adding a future mobile or admin app cheap.

```
/mysterio
  package.json                  # workspaces: apps/*, packages/*
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example
  PLAN.md                       # this document
  README.md
  docker-compose.yml            # postgres + minio (S3-compatible) for local dev

  /apps
    /api                        # Express backend
      src/
        index.ts                # express bootstrap
        config/env.ts           # zod-validated env loader
        db/
          client.ts             # pg Pool / drizzle or kysely instance
          migrations/           # SQL migrations
          repositories/
            mysteries.repo.ts
            users.repo.ts
            clues.repo.ts
            solutions.repo.ts
        routes/
          mysteries.routes.ts
          clues.routes.ts
          solutions.routes.ts
          health.routes.ts
        middleware/
          auth.ts
          rateLimit.ts
          errorHandler.ts
          requestLogger.ts
        services/
          generation/
            orchestrator.ts            # runs the 4-phase pipeline
            agents/
              logicStructureAgent.ts
              validationAgent.ts
              narrativeAgent.ts
              ttsAgent.ts
            prompts/
              logicStructure.system.ts
              validation.system.ts
              narrative.system.ts
            schemas/
              logicStructure.schema.ts # Zod schema for LogicStructure JSON
              validationResult.schema.ts
            retry.ts                   # max-3-attempt loop helper
          storage/
            audioStorage.ts            # S3/MinIO uploader + signed URLs
          jobs/
            generationQueue.ts         # BullMQ wrapper
            generationWorker.ts        # consumes queue, runs orchestrator
          anthropic/
            client.ts                  # wraps @anthropic-ai/sdk
          elevenlabs/
            client.ts                  # wraps ElevenLabs REST
        types/
          api.ts                       # request/response DTOs
        utils/
          logger.ts
          ids.ts
      test/
        unit/
        integration/
        fixtures/
          golden-mysteries/            # known-good logic structures for replay tests

    /web                        # React + Vite frontend
      src/
        main.tsx
        App.tsx
        routes.tsx              # react-router-dom v6
        api/
          client.ts             # fetch wrapper, picks up auth header
          mysteries.ts
          clues.ts
          solutions.ts
        screens/
          MainScreen/
            MainScreen.tsx
            CategoryGrid.tsx
            DifficultyPicker.tsx
            RecentList.tsx
          PlaybackScreen/
            PlaybackScreen.tsx
            AudioPlayer.tsx
            TranscriptPanel.tsx
            ClueTracker/
              ClueTracker.tsx
              ClueCategoryTabs.tsx
              ClueEditor.tsx
          SolutionScreen/
            SolutionScreen.tsx
            ClueSummary.tsx
            GuessForm.tsx
            RevealPanel.tsx
        state/
          playbackStore.ts      # zustand
          clueStore.ts
          generationStore.ts    # tracks job status + polling
        hooks/
          useGenerationJob.ts
          useAudioPlayer.ts
          useTranscriptScroll.ts
        components/
          Button.tsx
          Modal.tsx
          LoadingMystery.tsx    # animated "detective is solving..." screen
        styles/
          tokens.css            # design tokens (kid-friendly palette)
        utils/
          format.ts

  /packages
    /shared                     # imported by both apps/api and apps/web
      src/
        index.ts
        types/
          mystery.ts            # Mystery, Difficulty, Category enums
          logicStructure.ts     # LogicStructure type (mirrors Zod)
          clue.ts
          solution.ts
        schemas/                # Zod schemas re-exported to web for form validation
          logicStructure.ts
        constants/
          categories.ts         # the 8 categories with display copy + icons

    /eslint-config
    /tsconfig                   # base, node, react variants
```

Why a monorepo: the `LogicStructure` type and the public API DTOs are shared verbatim between server and client. Duplicating them invites drift. `packages/shared` is the single source of truth.

---

## 2. Milestones

T-shirt sizing: **S** ~ 1-2 days, **M** ~ 3-5 days, **L** ~ 1-2 weeks.

### M0 — Project Setup (S)

**Deliverables**
- pnpm workspace, TS config chain, ESLint/Prettier, Husky + lint-staged
- `docker-compose.yml` running Postgres 16 + MinIO
- `.env.example` with `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `S3_*`, `JWT_SECRET`
- Health check endpoint `GET /health` returning `{status: "ok", db: true}`
- CI: GitHub Actions running `pnpm lint && pnpm typecheck && pnpm test`

**Key files**: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `apps/api/src/index.ts`, `apps/api/src/routes/health.routes.ts`, `docker-compose.yml`.

**Acceptance**: `pnpm dev` boots api on :3001 and web on :5173; `curl /health` returns ok; `pnpm test` runs (zero tests is fine).

---

### M1 — Database Schema & Repositories (S)

**Deliverables**
- SQL migrations creating `users`, `mysteries`, `user_clues`, `solutions` exactly per spec, plus indices on `mysteries.user_id`, `user_clues.mystery_id`, `solutions.mystery_id`
- A migration runner (`node-pg-migrate` or Drizzle Kit)
- Repository classes with typed CRUD: `MysteriesRepo.create`, `getById`, `listByUser`, `updateNarrative`, `updateValidation`, `updateAudioUrl`; analogous for clues/solutions/users
- Seed script that inserts a single dev user

**Key files**: `apps/api/src/db/migrations/0001_init.sql`, `apps/api/src/db/repositories/*.ts`, `packages/shared/src/types/mystery.ts`.

**Dependencies**: M0.

**Acceptance**: `pnpm migrate` creates all tables; integration test inserts and reads a mystery row including a `logic_structure` JSONB blob.

---

### M2 — Generation Pipeline Skeleton (M)

Get the orchestrator wiring right *before* writing real prompts. Use stub agents that return canned data so the plumbing is testable.

**Deliverables**
- `services/generation/orchestrator.ts` exposing `generateMystery({category, difficulty, userId}): Promise<Mystery>` that calls the four agents in sequence and writes intermediate state to the DB
- Agent interface contract (see Section 3)
- BullMQ queue + worker (`generationQueue.ts`, `generationWorker.ts`) so the HTTP request doesn't block for 60-120s
- `POST /api/mysteries/generate` enqueues a job and returns `{mystery_id, status: "pending"}`
- `GET /api/mysteries/:id` returns the mystery with a `status` field (`pending|generating_logic|validating|writing|synthesizing|ready|failed`)
- Stub agents: `logicStructureAgent` returns a hardcoded fixture; `validationAgent` always returns `{passed: true}`; `narrativeAgent` returns lorem ipsum; `ttsAgent` returns a static `audio_url`

**Key files**: `apps/api/src/services/generation/orchestrator.ts`, `services/generation/agents/*.ts`, `services/jobs/generationQueue.ts`, `routes/mysteries.routes.ts`.

**Dependencies**: M1.

**Acceptance**: An end-to-end test posts to `/generate`, polls `/mysteries/:id` until `status === "ready"`, and asserts the mystery row has a logic_structure, narrative_text, and audio_url.

---

### M3 — Logic Structure Agent + Validation Agent (L)

The hardest milestone. This is where prompt engineering, schema validation, and the regeneration loop come together. See Section 3 and Section 4 for prompt and loop design.

**Deliverables**
- Real `logicStructureAgent.ts` that calls Claude with `prompts/logicStructure.system.ts`, parses the JSON response, validates against `logicStructure.schema.ts` (Zod). On schema failure, retries up to 2 times with the schema error appended to the user message.
- Real `validationAgent.ts` that takes only `essential_clues[]` + setting + characters list (no `true_solution`, no `logic_chain`) and asks Claude to deduce who/how/why. Returns `{guess: {who, how, why}, reasoning: string}`.
- Mechanical comparison: `services/generation/compareSolutions.ts` that normalizes (lowercase, trim, strip articles) and matches `validation_guess.who` against `true_solution.who_did_it`. Use exact match on `who` (character id), and a Claude-based semantic check on `how`/`why` with a small dedicated grader prompt that returns `{match: boolean, reason: string}`.
- The orchestrator wraps logic-gen + validation in a single retry loop with `MAX_REGEN_ATTEMPTS = 3`. Each failure passes the previous validation notes back into the logic-structure prompt so Claude knows what to fix.
- Persist `validation_passed` and `validation_notes` on the mystery row regardless of outcome.

**Key files**: `services/generation/agents/logicStructureAgent.ts`, `validationAgent.ts`, `compareSolutions.ts`, `prompts/logicStructure.system.ts`, `prompts/validation.system.ts`, `retry.ts`, `schemas/logicStructure.schema.ts`.

**Dependencies**: M2.

**Acceptance**: Across 20 generated logic structures, ≥ 90% pass validation within 3 attempts; 100% conform to the Zod schema or are rejected.

---

### M4 — Narrative Agent + TTS Agent (M)

**Deliverables**
- `narrativeAgent.ts`: takes the validated `LogicStructure` and writes a 700-1500 word story (5-10 min at ~150 wpm spoken). Difficulty controls false-clue density per spec (Easy 1-2, Medium 3-4, Hard 5+). Output is plain prose; the agent must weave in *every* `essential_clues[].description` literally enough to survive a text-match test (see Section 8). System prompt enforces: age 8-13 voice, mild spookiness only, no graphic content, no real-world brands, second-person or third-person limited POV.
- Post-narrative essential-clue text-match check: for each essential clue, verify a fuzzy substring match (token-set ratio ≥ 0.75 via `fastest-levenshtein` or a small custom matcher) appears in the narrative. If any clue is missing, regenerate the narrative once with the missing clues called out. Cap at 2 narrative retries.
- `ttsAgent.ts`: calls ElevenLabs `text-to-speech/{voice_id}` with a kid-friendly voice (e.g. "Domi" or a custom voice). Streams MP3 bytes, uploads to S3/MinIO at `s3://mysterio-audio/{mystery_id}.mp3`, returns the public or signed URL. See Section 5.
- Update orchestrator to call these in phases 3 and 4.

**Key files**: `services/generation/agents/narrativeAgent.ts`, `ttsAgent.ts`, `prompts/narrative.system.ts`, `services/storage/audioStorage.ts`, `services/elevenlabs/client.ts`.

**Dependencies**: M3.

**Acceptance**: `/generate` produces a real audible MP3 for all 8 categories at all 3 difficulties; every essential clue text-matches into the narrative.

---

### M5 — Frontend Playback (M)

**Deliverables**
- `MainScreen` with category grid (8 tiles), difficulty picker, Generate button, recent mysteries list
- `useGenerationJob` hook: posts to `/generate`, polls `/mysteries/:id` every 2s with exponential backoff cap, surfaces a "detective is on the case" loading screen with progress copy keyed off `status`
- `PlaybackScreen` with `AudioPlayer` (HTML5 `<audio>` wrapped in a custom UI: play/pause, scrubber, 0.75/1/1.25/1.5x via `playbackRate`)
- `TranscriptPanel` with auto-scroll synced to current playback time. v1: simple full-text display (no word-level highlighting). v2 enhancement: word-timestamp sync if ElevenLabs returns alignment data.
- Pause/resume persists `currentTime` to localStorage keyed by `mystery_id`
- Zustand stores: `playbackStore` (currentTime, isPlaying, rate), `clueStore` (server-synced list of user clues)

**Key files**: `apps/web/src/screens/MainScreen/*`, `screens/PlaybackScreen/*`, `state/playbackStore.ts`, `hooks/useGenerationJob.ts`, `hooks/useAudioPlayer.ts`.

**Dependencies**: M2 (for polling endpoint), M4 (for real audio).

**Acceptance**: A child can generate a mystery, hear it read aloud, pause/resume across page reloads, and adjust speed.

---

### M6 — Clue Tracker (S)

**Deliverables**
- `ClueTracker` component with five tabs: Characters, Items, Locations, Events, Notes (matches `category_type` enum)
- Add/edit/delete clues via `POST/PATCH/DELETE /api/mysteries/:id/clues`
- Tracker pauses audio when opened (configurable)
- Optimistic UI: local zustand cache + server reconciliation
- `clues.routes.ts` implementing the three endpoints

**Key files**: `apps/web/src/screens/PlaybackScreen/ClueTracker/*`, `apps/api/src/routes/clues.routes.ts`, `state/clueStore.ts`.

**Dependencies**: M5.

**Acceptance**: Clues persist across sessions; clue list survives a full page refresh.

---

### M7 — Solution Flow (M)

**Deliverables**
- `SolutionScreen` with three components: `ClueSummary` (read-only list of all user-saved clues), `GuessForm` (three text inputs: who, how, why), `RevealPanel` (shown after submit)
- `POST /api/mysteries/:id/submit-solution` grades the guess using the same comparison logic as M3 (exact-ish on `who`, Claude semantic grader on `how`/`why`) and writes a row to `solutions`
- `GET /api/mysteries/:id/solution` returns the user's submitted guess plus the true solution and an explanation paragraph generated on demand (small Claude call: "given this logic_structure and this user guess, write a 150-word kid-friendly explanation tying the essential clues to the answer")
- Cache the explanation on the mystery row to avoid regenerating

**Key files**: `apps/web/src/screens/SolutionScreen/*`, `apps/api/src/routes/solutions.routes.ts`, `services/generation/explanationAgent.ts`.

**Dependencies**: M3 (compareSolutions), M6.

**Acceptance**: Submitting a correct guess returns `is_correct: true`; reveal screen explains the answer using the essential clues.

---

### M8 — Polish, Safety, Testing (M)

**Deliverables**
- Auth: simple email-magic-link or anonymous device-id auth (see Section 6 — flagged as a spec gap)
- Rate limiting on `/generate` (e.g. 5/hour/user) via `express-rate-limit`
- Content moderation pass: a final lightweight Claude call that asks "is this story safe for ages 8-13" returning `{safe: bool, reason}`. If unsafe, regenerate narrative once.
- Error boundaries on every React screen
- Accessibility: keyboard nav, captions toggle for transcript, color-contrast pass
- Mobile-first responsive at iPhone SE width through iPad Pro
- Telemetry: log generation latency, retry counts, validation pass rate, narrative word count, audio length per mystery — store in a `mystery_metrics` table
- The full automated solvability suite (Section 8)
- Admin endpoint `GET /api/mysteries/:id/logic` gated behind an `ADMIN_TOKEN` header

**Dependencies**: All previous.

**Acceptance**: Solvability suite runs in CI; one full generation costs less than the budgeted target (Section 9); Lighthouse mobile score ≥ 85.

---

## 3. Multi-Agent Generation Pipeline

Four agents, each a thin function around `anthropic.messages.create` (or ElevenLabs for TTS). Every agent has a strict TypeScript signature and a Zod-validated output where applicable.

### Agent Interface

```ts
interface Agent<I, O> {
  name: string;
  run(input: I, ctx: GenerationContext): Promise<O>;
}

interface GenerationContext {
  mysteryId: string;
  attempt: number;
  previousFailureNotes?: string;
  logger: Logger;
}
```

### Phase 1 — Logic Structure Agent

**Inputs**: `{category, difficulty, previousFailureNotes?}`
**Output**: `LogicStructure` (validated against Zod schema)
**Model**: Claude Sonnet (cheaper than Opus, sufficient for structured generation)
**System prompt** (`prompts/logicStructure.system.ts`) — paraphrased structure, not literal:
- Role: "You are a mystery designer for kids ages 8-13."
- Hard rules: age-appropriate, no violence beyond mild peril, no real brands, missing-person mysteries are always reunions never harm.
- Output contract: emit a single JSON object matching the supplied schema. No prose.
- Difficulty rules: Easy = 3 essential clues, 1-2 false; Medium = 4 essential, 3-4 false; Hard = 5 essential, 5+ false.
- The `logic_chain[]` must be an ordered list of statements where each combines clues already introduced to deduce part of `true_solution`.
- If `previousFailureNotes` is set: "Your previous attempt failed validation because: {notes}. Fix these issues."

**User message**: `Generate a {difficulty} {category} mystery.`

**Retries**: up to 2 internal retries on Zod parse failure (different from the outer 3-attempt logic+validation loop). The Zod error message is appended to the user message.

### Phase 2 — Validation Agent

See Section 4 for the deep dive. Inputs: a *redacted* `LogicStructure` (essential clues + characters + setting only). Output: `{guess: {who, how, why}, reasoning, confidence: number}`.

### The Outer Regeneration Loop

```ts
// services/generation/orchestrator.ts (pseudocode, not literal)
for (let attempt = 1; attempt <= 3; attempt++) {
  const logic = await logicStructureAgent.run({category, difficulty, previousFailureNotes}, ctx);
  const guess = await validationAgent.run({redacted: redact(logic)}, ctx);
  const result = await compareSolutions(guess, logic.true_solution);
  if (result.passed) {
    await mysteriesRepo.update(id, {logic_structure: logic, validation_passed: true, validation_notes: result.notes});
    return logic;
  }
  previousFailureNotes = result.notes; // fed into next attempt
}
throw new GenerationFailure("logic+validation failed after 3 attempts");
```

On final failure the mystery row is written with `validation_passed = false` and the user gets a "couldn't craft a fair mystery — try again?" UX. Counted in metrics.

### Phase 3 — Narrative Agent

**Inputs**: validated `LogicStructure`, `difficulty`
**Output**: `{title: string, narrative_text: string}`
**System prompt** (`prompts/narrative.system.ts`): role of a children's audiobook author; constraints on tone, length (700-1500 words), POV, and explicit instruction to include each essential clue's description verbatim or as a clear paraphrase. Title constraint: 3-7 words, intriguing not scary.

**Retries**: post-generation text-match check (see M4). If any essential clue isn't matched, retry once with `previousFailureNotes = "the following clues were not clearly included: ..."`. Max 2 narrative attempts.

### Phase 4 — TTS Agent

Not an LLM — calls ElevenLabs. See Section 5.

### Why split logic and narrative?

A combined "write the whole mystery in one go" prompt empirically produces unfair mysteries: the LLM tends to introduce the answer in the prose without dropping the clues earlier. Generating the logic skeleton first, validating it independently, and *then* writing the prose forces the clues to exist before they're embedded in narrative.

---

## 4. Validation Agent Deep Dive

The validation agent is the project's correctness backbone. Its job: prove the mystery is solvable from essential clues alone.

### Mechanism

1. The orchestrator builds a `RedactedLogicStructure` containing **only**:
   - `mystery_type`
   - `setting`
   - `characters[]` with `id`, `name`, `role`, `description` — but `is_culprit` and `motive` are stripped
   - `essential_clues[]` (full)
   - **Excluded**: `false_clues`, `true_solution`, `logic_chain`
2. The redacted blob is passed as JSON in the user message.
3. The validation agent's system prompt frames it as a detective who must reason from clues only and emit `{guess: {who: <character_id>, how: <one sentence>, why: <one sentence>}, reasoning: <step-by-step>, confidence: 0..1}`.
4. The validation agent runs in a *fresh* conversation — it has no memory of the logic-generation call. Use a separate Anthropic client invocation.

### Mechanical Comparison

`compareSolutions(guess, true_solution)` returns `{passed: boolean, notes: string}`:

- **Who**: exact match on character id. Anything else fails immediately. This is the strict gate.
- **How**: too varied for string match. Use a small grader prompt: "Are these two explanations describing the same method? Reply JSON `{match: boolean, reason: string}`." Run with low temperature.
- **Why**: same grader treatment.
- **Confidence floor**: if validation `confidence < 0.5`, treat as failure even if matches — the clues weren't decisive enough.

`notes` is a human-readable string concatenating all mismatches; this string becomes `previousFailureNotes` on retry, so the next logic-generation attempt knows e.g. "validation agent guessed Mr. Brown instead of Ms. Green because the clue about the muddy boots wasn't decisive enough; add a clue that uniquely points to Ms. Green."

### Failure Modes Explicitly Handled

- Validation agent guesses a non-suspect character: schema-rejected, treated as failure with `notes = "validation agent's guess was not in suspects list"`.
- Validation agent emits malformed JSON: retry the validation call once, then treat as failure.
- The same logic structure passes validation but later fails the narrative text-match check (clues weren't actually used in prose): handled in M4's narrative loop, not the validation loop.

### Storing Validation Results

Every run — pass or fail — writes to `mysteries.validation_passed` and `mysteries.validation_notes`. This lets the test harness in Section 8 replay validation against the stored corpus.

---

## 5. TTS Approach & Audio Storage

### Provider Boundary

**Anthropic Claude does not provide TTS.** All audio synthesis is delegated to ElevenLabs. The plan should treat TTS as a swappable adapter so we can move to OpenAI TTS, Google Cloud TTS, or PlayHT later without touching the orchestrator.

`services/elevenlabs/client.ts` exposes:

```ts
interface TTSProvider {
  synthesize(text: string, opts: {voiceId: string; modelId?: string}): AsyncIterable<Uint8Array>;
}
```

Default voice: a warm mid-pitched narrator voice (e.g. ElevenLabs "Charlie" or a custom-cloned children's-book narrator). Voice id stored in env (`ELEVENLABS_VOICE_ID`).

### Storage

- **Local dev**: MinIO via docker-compose, bucket `mysterio-audio`.
- **Production**: AWS S3, same bucket name, private ACL, served via CloudFront with signed URLs (5-minute expiry rotated by the API on each `GET /mysteries/:id`).
- Object key: `{mystery_id}.mp3`. ContentType `audio/mpeg`. Cache-Control `public, max-age=31536000, immutable` (the audio for a given mystery never changes).
- The `mysteries.audio_url` column stores the *S3 key*, not the signed URL. The API mints a fresh signed URL on each fetch.

### Cost & Latency

ElevenLabs charges per character. A 1500-word story is roughly 8000 characters → at $0.30/1K chars ≈ $2.40 per mystery. This is the dominant cost — see Section 9. Synthesis takes 10-30s for a full story; we stream the upload to S3 to overlap network and synthesis.

### Future: Word-Level Timestamps

ElevenLabs offers a `with_timestamps` mode returning per-character alignment. Defer to v2 — useful for syncing transcript highlight to playback position.

---

## 6. API Endpoints

All endpoints under `/api`. JSON request and response bodies. All authenticated routes require an `Authorization: Bearer <token>` header.

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/mysteries/generate` | user | `{category: Category, difficulty: "easy"\|"medium"\|"hard"}` | `202 {mystery_id, status: "pending"}` |
| GET | `/mysteries/:id` | user (owner) | — | `{mystery_id, title, category, difficulty, status, audio_url?, narrative_text?, created_at}` |
| GET | `/mysteries/:id/transcript` | user (owner) | — | `{narrative_text: string}` |
| POST | `/mysteries/:id/clues` | user (owner) | `{category_type, content}` | `201 {clue_id, ...}` |
| GET | `/mysteries/:id/clues` | user (owner) | — | `{clues: Clue[]}` |
| PATCH | `/mysteries/:id/clues/:clueId` | user (owner) | `{content?}` | `{clue_id, ...}` |
| DELETE | `/mysteries/:id/clues/:clueId` | user (owner) | — | `204` |
| POST | `/mysteries/:id/submit-solution` | user (owner) | `{user_guess_who, user_guess_how, user_guess_why}` | `{solution_id, is_correct, explanation}` |
| GET | `/mysteries/:id/solution` | user (owner) | — | `{solution: Solution, true_solution, explanation}` |
| GET | `/mysteries/:id/logic` | admin | — | `{logic_structure: LogicStructure}` |
| GET | `/health` | none | — | `{status, db, queue}` |

The spec lists POST clues but not PATCH/DELETE — adding both since the UI says "pause and edit." Confirm with product.

### Auth — Spec Gap

The spec defines a `users` table with `email` but no auth flow. **This is a gap to flag.** Recommendation:

- **MVP**: anonymous device-id auth — frontend generates a UUID on first launch, stores in localStorage, sends as `Authorization: Bearer device_<uuid>`. The API auto-provisions a `users` row keyed by this id with a synthetic email.
- **v2**: real email magic-link via Resend or a parent-verified flow (see COPPA in Section 9).
- All endpoints check `mystery.user_id === req.user.id` for ownership. Admin endpoint checks `req.headers['x-admin-token'] === ADMIN_TOKEN`.

---

## 7. Frontend Screens & State

### Screens

- **MainScreen** (`/`): `CategoryGrid` (8 tiles with kid-friendly icons), `DifficultyPicker` (3 chunky buttons), `RecentList` (last 10 mysteries from `GET /mysteries?user=me` — add this endpoint), Generate CTA.
- **PlaybackScreen** (`/mysteries/:id`): `AudioPlayer` (top), `TranscriptPanel` (middle, scrolls with playback), `ClueTracker` (slide-in drawer from right on desktop, bottom sheet on mobile). Header has back button and "I think I know!" CTA → SolutionScreen.
- **SolutionScreen** (`/mysteries/:id/solve`): `ClueSummary` (recap of saved clues), `GuessForm` (three labeled inputs with kid-friendly placeholders), submit shows `RevealPanel` with correct/incorrect badge, true answer, and the explanation paragraph.
- **LoadingMystery** (`/mysteries/:id` while `status !== "ready"`): full-screen animated state with copy keyed off backend status.

### State Management

Zustand chosen over Redux for ergonomics; React Query for server state caching.

- `playbackStore`: `{currentTime, duration, isPlaying, rate}`. Synced to `<audio>` element via a single ref. Persisted to localStorage on change (debounced 500ms).
- `clueStore`: derived from React Query cache for `GET /clues`; mutations via React Query `useMutation` with optimistic update.
- `generationStore`: `{jobs: Record<mysteryId, {status, startedAt, lastPoll}>}`. The `useGenerationJob` hook subscribes and polls `GET /mysteries/:id` every 2s starting at 1s, capped at 5s, max 5min total before giving up.
- Transcript streaming v1: not streamed — narrative is delivered whole once `status === "ready"`. Transcript v2 (after spec-stable): server streams narrative tokens via SSE during generation so kids see the story being written. Defer.

### Audio Playback

Native HTML5 `<audio>`. The `useAudioPlayer` hook centralizes:
- play/pause/seek
- `playbackRate` updates from the speed control
- `timeupdate` event drives `playbackStore.currentTime`
- restoring `currentTime` from localStorage on mount
- iOS Safari quirk: must call `.play()` from a user gesture; the first play triggers a "tap to start" overlay

### Clue Tracker UX

- Tabs: Characters / Items / Locations / Events / Notes
- "Pause and edit" mode: opening the tracker auto-pauses audio; closing resumes (configurable in settings)
- Each clue row: timestamp captured at creation (current playback time), inline-editable content, delete button
- Empty-state copy per tab: "Heard about a suspicious character? Add them here."

---

## 8. Testing Strategy

### Unit Tests (Vitest)

- Zod schemas: malformed `LogicStructure` rejected; valid one parses
- `compareSolutions`: matrix of who/how/why combinations
- `redact()`: stripped fields are absent from output
- React components with @testing-library: ClueTracker add/edit/delete, GuessForm validation, AudioPlayer state transitions
- Backend repos: insert/read round-trip for each table

### Integration Tests

- Spin up Postgres + MinIO via testcontainers
- `generate-mystery.integration.test.ts`: stub Claude and ElevenLabs clients with deterministic fixtures, run full orchestrator end-to-end, assert DB rows
- `regen-loop.integration.test.ts`: stub validation to fail twice then pass; assert orchestrator records 3 attempts and final pass
- `regen-exhaustion.integration.test.ts`: stub validation to always fail; assert mystery row written with `validation_passed = false`

### Solvability Suite (the headline correctness suite the spec calls for)

Located in `apps/api/test/solvability/`. Runs in nightly CI, not on every PR (LLM cost).

1. **Schema sweep**: query `SELECT * FROM mysteries WHERE logic_structure IS NOT NULL`, parse each through the Zod schema, fail the suite if any row is invalid.
2. **Essential-clue text-match sweep**: for each mystery, for each `essential_clues[i].description`, assert a fuzzy match (token-set ratio ≥ 0.75) against `narrative_text`. Report per-mystery and aggregate pass rate.
3. **Re-validation sweep**: rerun the validation agent against each stored mystery's redacted logic structure. Compute pass rate; alert if it drops below 85%. This catches prompt regressions over time.
4. **Difficulty calibration**: aggregate pass rates by difficulty; assert Easy ≥ 95%, Medium ≥ 85%, Hard ≥ 75%.

### Manual QA Checklist

- 5 generations per category × difficulty (120 total) listened to end-to-end before launch
- Mobile Safari, Chrome iOS, iPad Safari
- Slow 3G simulation: loading screen never blocks for >2s of unexplained silence

---

## 9. Risks & Open Questions

### Cost

- **Claude per mystery**: logic-structure (Sonnet, ~3K in / ~2K out) ≈ $0.04. Validation (Sonnet, ~2K in / ~1K out) ≈ $0.02. Grader (~500 in / 100 out) ≈ $0.005. Narrative (Sonnet, ~3K in / ~2K out) ≈ $0.04. Worst case 3× retries on logic+validation: ~$0.20. Average: ~$0.10. **Open question**: do we use Opus for narrative quality? That would multiply by ~5×.
- **ElevenLabs per mystery**: ~$2.40 at $0.30/1K chars for a 1500-word story. **This dominates total cost.** Mitigation options: cheaper TTS (OpenAI tts-1 at $15/1M chars ≈ $0.12/mystery — 20× cheaper, lower quality), aggressive caching of generated mysteries (let kids replay), or category templates that get reused with minor narrative variation.
- **Total per mystery**: ~$2.50. At 1000 mysteries/month that's $2.5K/month. Need a per-user generation cap (e.g. 3/day) and consider a freemium model.

### Long Generation Time UX

A full pipeline takes 60-120s end-to-end (logic ~10s, validation ~10s × up to 3 attempts, narrative ~20s, TTS ~30s). Two options:

- **Async + poll** (recommended for MVP): immediate `202` response, frontend shows a "the detective is on the case" animation with phase-keyed copy ("gathering clues...", "checking the case is solvable...", "writing the story...", "recording the narrator..."). Poll every 2s.
- **SSE streaming** (v2): stream phase transitions and even narrative tokens. Better UX but more infra.

### Child Safety / Moderation

- All prompts include explicit safety constraints — but constraints aren't enforcement.
- Add a final moderation pass (M8): a small Claude call with `{narrative_text}` returning `{safe, reasons[]}`. Reject and regenerate on unsafe.
- Consider Anthropic's `prompt_caching` for the safety preamble across all agents to reduce cost.
- Bad-word filter on user-entered clues and guesses (basic regex list — not a real solution but a backstop).

### COPPA Implications (US, ages 8-13)

- Children under 13 are protected by COPPA. Collecting any PII (email, name) requires verifiable parental consent.
- **Recommended posture for MVP**: collect zero PII. Anonymous device-id auth. No accounts. No sharing features. No comments. No ads.
- Mysteries and clues are stored against a device-id, not a person. Add a "delete all my data" button.
- For a parent-account v2: use a verified-parent flow (credit-card auth check or signed consent form) before any email collection. Consult counsel before launch.
- GDPR-K (EU under-16) is similar — same anonymous-by-default posture covers it.

### Other Open Questions

- **Voice consistency across categories**: same narrator for all mysteries, or category-specific voices (a spooky one for Haunted Mansion, a cheerful one for Missing Pet)? Impacts ElevenLabs voice setup.
- **Replay**: can a kid replay the same mystery? UX implication for "recent" list and for cost (replays are free since audio is cached).
- **Hint system**: spec doesn't mention hints. Likely needed for Hard mode for ages 8-10. Defer to v2.
- **Save/load partial progress**: spec mentions pause/resume — confirmed via localStorage. But what about resuming on a different device? Needs server-side `playback_position` column. Defer.
- **Auth flow** (already flagged): MVP picks anonymous device-id; product should sign off.

---

## 10. Effort Summary

| Milestone | Description | Size |
|---|---|---|
| M0 | Project setup, monorepo, CI, docker-compose | S |
| M1 | DB schema, migrations, repositories | S |
| M2 | Generation pipeline skeleton (stub agents, queue, polling) | M |
| M3 | Real logic + validation agents + regen loop | L |
| M4 | Narrative agent + ElevenLabs TTS + S3 storage | M |
| M5 | Frontend playback (Main + Playback screens, audio + transcript) | M |
| M6 | Clue tracker | S |
| M7 | Solution flow + grading + reveal | M |
| M8 | Polish, safety, auth, solvability suite, telemetry | M |

**Total: ~7-9 weeks** for a single full-stack engineer, ~4-5 weeks with a frontend + backend pair working in parallel from M2 onward.

### Critical Path

M0 → M1 → M2 → M3 is sequential and gates everything. M4 unblocks M5; M5 unblocks M6 and M7; M8 runs alongside M5-M7 once the test harness is started.

### Parallelization Opportunities

- After M2, frontend can build M5 against the stub agents while backend is working on M3+M4.
- M6 (clue tracker UI) and M3 (validation agent) can be built simultaneously.
- The solvability test harness in M8 can begin as soon as M3 lands.

---

## Appendix A — Key File Reference

Names and signatures for the most load-bearing files. These are the contracts the rest of the codebase depends on.

- `packages/shared/src/types/logicStructure.ts` — exports `LogicStructure`, `EssentialClue`, `Character`, `TrueSolution`, `Difficulty`, `Category`.
- `apps/api/src/services/generation/orchestrator.ts` — exports `generateMystery(input: GenerateInput, ctx: GenerationContext): Promise<Mystery>`.
- `apps/api/src/services/generation/agents/logicStructureAgent.ts` — exports `run(input, ctx): Promise<LogicStructure>`.
- `apps/api/src/services/generation/agents/validationAgent.ts` — exports `run(input: {redacted: RedactedLogicStructure}, ctx): Promise<ValidationResult>`.
- `apps/api/src/services/generation/compareSolutions.ts` — exports `compareSolutions(guess, truth): Promise<{passed: boolean, notes: string}>`.
- `apps/api/src/services/elevenlabs/client.ts` — exports `synthesize(text, opts): AsyncIterable<Uint8Array>`.
- `apps/api/src/routes/mysteries.routes.ts` — wires the four mystery endpoints.
- `apps/web/src/hooks/useGenerationJob.ts` — exports `useGenerationJob(input): {mysteryId?, status, error}`.
