# Mysterio — PRD & Design Spec

**Date:** 2026-05-04
**Status:** Approved — implementation starting
**Supersedes scope of:** `PLAN.md` (the production-grade plan; kept as reference for the multi-agent pipeline design but its M0/M1/M8 milestones are intentionally cut down here)

---

## 1. Summary

Mysterio is a web-based AI-generated mystery game for two specific kids (P1, age 8 and P2, age 10), running on a single exe.dev VM at `https://panther-golem.exe.xyz/`. Each kid picks a category and difficulty, waits ~60-120s while Claude generates a logic-validated mystery and OpenAI synthesizes narration, then listens, takes notes in an in-app clue tracker, and submits a who/how/why solution.

This is a **personal/family project**, not a product. It's optimized for speed-to-first-mystery and longevity-of-fun for two specific users. It is explicitly *not* optimized for scale, multi-tenancy, polish-for-strangers, or compliance — those concerns are deliberately out of scope.

## 2. Users

Two kids share two iPads (and occasionally a laptop). They access `panther-golem.exe.xyz` directly; the URL is set to public via `ssh exe.dev share set-public panther-golem` so the iPads don't need to authenticate to exe.dev.

### P1 — age 8
- Reading-level appropriate but listening-first
- Default difficulty: **Easy** (3 essential clues, 1-2 false)
- Attention span: 7-10 minutes for narration → target story length **~600 words / ~5 min** at narration speed
- Needs a hint path and a "give up" path to avoid frustration
- Tone preference: cozy/silly over spooky; no real peril
- Solution input: tap-the-suspect (no typing the "who"), short typed how/why

### P2 — age 10
- Comfortable reader, can handle mild spooky and longer stories
- Default difficulty: **Medium** (4 essential clues, 3-4 false) → target **~900 words / ~6.5 min**
- Will eventually want Hard mode (5+ essential clues) → target **~1200 words / ~8.5 min**
- Same UI as P1; the player picker doesn't bifurcate the experience, it just sets defaults

### Player isolation
A first-run modal asks "Who's playing?" and offers two buttons. Selection is stored in `localStorage.activePlayer`. There is no real auth — the player picker only scopes the Recent list, default difficulty, and clue/solution ownership in the DB.

## 3. Success criteria

1. Each kid can complete a full mystery loop (generate → listen → solve → reveal) without an adult intervening.
2. Each kid plays at least 3 mysteries the first weekend post-ship and asks for more the next day.
3. Total cost stays under **$25/month** at sustained 50 mysteries/month.
4. ≥85% of generated mysteries pass validation within ≤3 attempts (matches `PLAN.md` §M3 acceptance).
5. P1 doesn't bounce on the loading screen — confirmed by watching, not telemetry.

## 4. MVP scope

### In
- 4 categories: **Missing Pet**, **Haunted Mansion**, **Stolen Treasure**, **Locked-Room**
- 3 difficulties: Easy / Medium / Hard
- Player picker with 2 hard-coded players
- 4-phase generation pipeline (logic + validation + regen loop + narrative + TTS) per `PLAN.md` §3-§4
- Clue tracker with 5 tabs (Characters / Items / Locations / Events / Notes), add / edit / delete, captures audio timestamp at creation
- Solution flow with character-picker for "who" + free-text for "how"/"why"
- Two-tier hints: "Give me a clue" (up to 2 nudges per mystery) + "I give up — tell me"
- Reveal explanation paragraph, generated on demand and cached
- Audio resume across page reloads (localStorage by mystery id)
- Mobile-responsive iPad Safari portrait + landscape

### Out (deliberate cuts from `PLAN.md`)
- ~~Real auth (email, magic link, OAuth)~~ — public URL + player picker
- ~~Postgres~~ — SQLite
- ~~S3 / MinIO / signed URLs~~ — local file system on exe.dev persistent disk
- ~~BullMQ / Redis / queue~~ — in-process async
- ~~Docker / docker-compose~~ — direct rsync deploy to one VM
- ~~Rate limiting~~
- ~~Telemetry / metrics tables~~
- ~~Admin endpoints~~ (`GET /api/mysteries/:id/logic` cut)
- ~~Content moderation final pass~~ (prompt-level safety constraints only)
- ~~Pre-generation / mystery pool~~
- ~~SSE / WebSocket streaming~~ — simple polling
- ~~Word-level transcript highlighting~~
- ~~Replay-across-devices server-side playback position~~ (localStorage only)
- ~~Solvability test suite (nightly CI)~~ — defer; this is a personal app
- ~~Lighthouse / accessibility / a11y polish~~

### Future / not now
- More categories
- Per-category narrator voices
- Hint system enhancements (more nudge tiers, contextual hints from clue tracker)
- Pre-generation if loading-screen bounce becomes real
- A "library" view that lets kids re-experience mysteries

## 5. Architecture

### Process model
**One Node process** runs on the exe.dev VM. Fastify serves both the API (`/api/*`) and the built React frontend (static files). exe.dev's HTTPS proxy puts TLS in front of port 3000.

```
iPad Safari ─→ panther-golem.exe.xyz (TLS by exe.dev proxy) ─→ Fastify :3000
                                                                ├── /          → React static (apps/web/dist)
                                                                ├── /api/*     → API routes
                                                                └── /audio/:id → MP3 streamed from disk
```

### Stack
| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 22 + TypeScript | |
| Server | **Fastify** | Built-in JSON-schema validation pairs with Zod; lighter than Express; first-class TS |
| DB | **SQLite via better-sqlite3 + Drizzle ORM** | WAL mode, type-safe queries, migrations as code, single file on persistent disk |
| Frontend | **React 19 + Vite** | Per `PLAN.md` |
| Routing | react-router-dom v6 | |
| State | Zustand + React Query | Per `PLAN.md` — RQ for server state, Zustand for playback/local state |
| Shared types | pnpm monorepo + `packages/shared` Zod schemas | LogicStructure / DTOs / Category / Difficulty live here, imported by both server and web |
| LLM | **Anthropic Claude Sonnet** (current — `claude-sonnet-4-6` at build time) | Per `PLAN.md`; prompt caching for safety preamble |
| TTS | **OpenAI tts-1-hd** | Voice: **fable** as default (warm narrator). A/B with kids during M3. |
| Process supervisor | systemd user-unit | One unit, restart on crash |
| Deploy | rsync + `pnpm install --prod` + systemctl restart | Single shell script |

### Repo layout
```
/mysterio
  package.json                    # workspaces
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example                    # ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_PATH, AUDIO_DIR, PORT
  CLAUDE.md
  PLAN.md                         # historical reference
  docs/superpowers/specs/         # this file
  scripts/
    deploy.sh                     # rsync + install + restart
    seed-players.ts               # one-off: insert P1 + P2

  apps/
    server/
      src/
        index.ts                  # Fastify bootstrap, static + API + audio routes
        config/env.ts             # Zod-validated env loader
        db/
          client.ts               # better-sqlite3 + Drizzle
          schema.ts               # Drizzle schema (sole source of truth for tables)
          migrations/             # generated by drizzle-kit
        routes/
          mysteries.ts
          clues.ts
          solutions.ts
          hints.ts
          health.ts
          static.ts               # serves apps/web/dist + /audio/*
        services/
          generation/
            orchestrator.ts       # 4-phase pipeline, status updates
            agents/
              logicStructureAgent.ts
              validationAgent.ts
              narrativeAgent.ts
              graderAgent.ts      # who/how/why semantic match
              hintAgent.ts
              explanationAgent.ts
            prompts/              # system prompts as TS string consts
            redact.ts             # builds RedactedLogicStructure for validation
            compareSolutions.ts
            textMatch.ts          # fuzzy essential-clue match in narrative
          tts/
            openaiTts.ts          # implements TTSProvider
            audioStorage.ts       # write MP3 to data/audio/<id>.mp3
          anthropic/
            client.ts             # wraps @anthropic-ai/sdk
        startup.ts                # mark stale 'pending' rows as failed on boot
      drizzle.config.ts
      systemd/mysterio.service    # user-unit template

    web/
      vite.config.ts
      index.html
      src/
        main.tsx, App.tsx, routes.tsx
        api/                      # fetch wrappers
        screens/
          PlayerPicker.tsx
          MainScreen/
          PlaybackScreen/
            ClueTracker/
          SolutionScreen/
            CharacterPicker.tsx
            HintControls.tsx
            RevealPanel.tsx
        state/                    # zustand stores
        hooks/                    # useGenerationJob, useAudioPlayer, useTranscriptScroll
        components/

  packages/shared/
    src/
      types/
        mystery.ts                # Mystery, Status enum
        logicStructure.ts         # LogicStructure, EssentialClue, Character, TrueSolution
        clue.ts, solution.ts, hint.ts
      schemas/
        logicStructure.ts         # Zod, used by both server (parse Claude output) and web (form validation)
      constants/
        categories.ts             # 4 categories: id, display name, icon, blurb
        difficulties.ts           # 3 difficulties + per-difficulty word-count target
        voices.ts                 # OpenAI voice ids
```

### Data flow — generate a mystery
1. iPad: `POST /api/mysteries/generate` `{category, difficulty, player_id}`
2. Server: insert `mysteries` row with `status='pending'`, return `202 {mystery_id}` immediately
3. Server: kick off `generateMystery(mysteryId)` async (NOT awaited by request handler)
4. Orchestrator updates `status` through phases: `generating_logic` → `validating` → (loop up to 3) → `writing` → `synthesizing` → `ready` (or `failed`)
5. iPad: poll `GET /api/mysteries/:id` every 2s; render phase-keyed loading copy until `status === 'ready'`
6. iPad: redirect to PlaybackScreen, fetch full mystery + audio at `/audio/<id>.mp3`

### Failure handling
- **Server restart mid-generation:** on Fastify boot, `UPDATE mysteries SET status='failed', failure_reason='server_restart' WHERE status NOT IN ('ready','failed')`. iPad shows "Something went wrong — start a new one?"
- **Claude returns malformed JSON / Zod parse fails:** retry up to 2× internal to the agent (per `PLAN.md` §3); on exhaustion, mark mystery `failed` with reason.
- **Validation fails 3× consecutive:** mystery written with `validation_passed=0`, status=`failed`, failure_reason=`validation_exhausted`. iPad shows "Couldn't craft a fair mystery — try again?"
- **Narrative text-match fails 2× consecutive:** mark `failed` with reason `narrative_clue_coverage`.
- **OpenAI TTS error:** retry once with shorter chunk if needed; on failure mark `failed` with reason `tts_error`.

### Concurrency
Two kids generating simultaneously is supported — both pipelines run in parallel, network-bound, ~60-120s each. No queue; Node async + a small VM is sufficient at this scale.

## 6. Data model (SQLite)

All tables created by Drizzle migration `0001_init`. `created_at` columns are unix-epoch integers via `(unixepoch())` default.

```sql
players (
  id TEXT PRIMARY KEY,                 -- 'p1', 'p2'
  name TEXT NOT NULL,
  default_difficulty TEXT NOT NULL CHECK(default_difficulty IN ('easy','medium','hard')),
  created_at INTEGER NOT NULL
);

mysteries (
  id TEXT PRIMARY KEY,                 -- nanoid(12)
  player_id TEXT NOT NULL REFERENCES players(id),
  category TEXT NOT NULL,              -- 'missing-pet'|'haunted-mansion'|'stolen-treasure'|'locked-room'
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
  status TEXT NOT NULL,                -- pending|generating_logic|validating|writing|synthesizing|ready|failed
  title TEXT,
  logic_structure_json TEXT,           -- JSON; matches LogicStructure Zod schema
  narrative_text TEXT,
  audio_path TEXT,                     -- relative to AUDIO_DIR, e.g. 'abc123.mp3'
  validation_passed INTEGER,           -- 0|1|NULL
  validation_attempts INTEGER NOT NULL DEFAULT 0,
  validation_notes TEXT,
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  ready_at INTEGER
);
CREATE INDEX idx_mysteries_player ON mysteries(player_id, created_at DESC);
CREATE INDEX idx_mysteries_active ON mysteries(status) WHERE status NOT IN ('ready','failed');

clues (
  id TEXT PRIMARY KEY,                 -- nanoid(8)
  mystery_id TEXT NOT NULL REFERENCES mysteries(id) ON DELETE CASCADE,
  category_type TEXT NOT NULL CHECK(category_type IN ('character','item','location','event','note')),
  content TEXT NOT NULL,
  audio_timestamp_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_clues_mystery ON clues(mystery_id);

solutions (
  id TEXT PRIMARY KEY,
  mystery_id TEXT NOT NULL UNIQUE REFERENCES mysteries(id) ON DELETE CASCADE,
  guess_who TEXT,                      -- character_id from logic_structure; NULL if gave_up=1
  guess_how TEXT,                      -- NULL if gave_up=1
  guess_why TEXT,                      -- NULL if gave_up=1
  is_correct INTEGER NOT NULL,         -- 1 only if gave_up=0 AND all three matched
  who_match INTEGER,                   -- NULL if gave_up=1
  how_match INTEGER,
  why_match INTEGER,
  hints_used INTEGER NOT NULL DEFAULT 0,
  gave_up INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,                    -- generated reveal copy, cached
  created_at INTEGER NOT NULL
);

hints (
  id TEXT PRIMARY KEY,
  mystery_id TEXT NOT NULL REFERENCES mysteries(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

The Zod-validated JSON in `mysteries.logic_structure_json` is the canonical structured form of the mystery. The `narrative_text` column is the prose. The `audio_path` references a file under `data/audio/`.

## 7. API endpoints

All under `/api`. JSON request/response. No auth header — `player_id` is sent in the request body or query string. Server trusts the client (it's our family).

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET  | `/health` | — | `{ok: true, db: true}` |
| GET  | `/players` | — | `{players: Player[]}` |
| POST | `/mysteries/generate` | `{player_id, category, difficulty}` | `202 {mystery_id, status: 'pending'}` |
| GET  | `/mysteries/:id` | — | `{id, player_id, category, difficulty, status, title?, narrative_text?, audio_url?, characters?, created_at, ready_at?, failure_reason?}` — `audio_url` is `/audio/<audio_path>`; `characters` is the public character list (id, name, role, description; no `is_culprit`/`motive`) extracted from `logic_structure_json` |
| GET  | `/mysteries?player_id=p1&limit=10` | — | `{mysteries: MysterySummary[]}` (Recent list) |
| POST | `/mysteries/:id/clues` | `{category_type, content, audio_timestamp_ms?}` | `201 {clue}` |
| GET  | `/mysteries/:id/clues` | — | `{clues: Clue[]}` |
| PATCH| `/mysteries/:id/clues/:clueId` | `{content?}` | `{clue}` |
| DELETE | `/mysteries/:id/clues/:clueId` | — | `204` |
| POST | `/mysteries/:id/hints` | — | `201 {hint}` (server enforces ≤2 hints per mystery) |
| POST | `/mysteries/:id/give-up` | — | `200 {solution}` (creates a solution row with `gave_up=1`, jumps to reveal) |
| POST | `/mysteries/:id/submit-solution` | `{guess_who, guess_how, guess_why}` | `200 {solution}` |
| GET  | `/mysteries/:id/solution` | — | `{solution, true_solution: {who, how, why}, characters, explanation}` |
| GET  | `/audio/:filename` | — | MP3 stream |

`GET /mysteries/:id` excludes `logic_structure_json` from response (no spoilers). `GET /solution` reveals it after submission.

## 8. Frontend screens

### Routes (react-router-dom)
- `/` — PlayerPicker if no `localStorage.activePlayer`, else MainScreen
- `/mysteries/:id` — PlaybackScreen
- `/mysteries/:id/solve` — SolutionScreen

### PlayerPicker (first-run modal)
"Who's playing?" → two big buttons (P1, P2). Stored in `localStorage.activePlayer`. Tiny "Switch player" link in MainScreen header.

### MainScreen
- 4 chunky category tiles (icons + names + 1-line blurb)
- 3 difficulty buttons under "Pick a difficulty" — defaulted to player's `default_difficulty`
- "Start Mystery" CTA
- Recent list (last 10 mysteries by current player) with status badges (Solved ✓ / In Progress / Failed)

### PlaybackScreen
- AudioPlayer (top): play/pause, scrubber, 0.75/1/1.25/1.5x speed; tap-to-start overlay on first interaction (iPad Safari requirement)
- TranscriptPanel (middle): full text, auto-scrolls with playback (no per-word highlight v1)
- ClueTracker (right drawer on desktop, bottom sheet on iPad): 5 tabs (Characters / Items / Locations / Events / Notes), each with add/edit/delete; captures `audio.currentTime` at creation
- Header: back arrow + "I think I know!" CTA → SolutionScreen
- Audio resume: `localStorage[playback_<id>] = currentTime`, debounced 500ms; restored on mount

### SolutionScreen
- ClueSummary (top): read-only list of saved clues, grouped by tab
- HintControls: "Need a hint?" button → exposes "Give me a clue" (counter shows remaining of 2) and "I give up — tell me" (warns once, then jumps to RevealPanel)
- GuessForm:
  - "Who did it?" — **character avatar grid**, tap to select. Avatars use a default icon set keyed by character role (Detective / Suspect / Witness / Bystander) since LogicStructure doesn't include images
  - "How did they do it?" — multiline text input
  - "Why did they do it?" — multiline text input
  - Submit button (disabled until all three filled)
- RevealPanel (after submit or give-up):
  - Badge: ✓ Correct / Partially right / Not quite (semantic grader output)
  - True answer rendered as 3 lines (Who / How / Why)
  - Explanation paragraph (cached from explanationAgent)
  - "Back to mysteries" CTA

### LoadingMystery
Shown while `status` is non-terminal. Phase-keyed copy:
- `pending` / `generating_logic` → "Gathering clues..."
- `validating` → "Checking the case is solvable..."
- `writing` → "Writing the story..."
- `synthesizing` → "Recording the narrator..."

Simple animation (a magnifying-glass loop is fine). Polls `GET /mysteries/:id` every 2s starting 1s after mount, capped at 5s, max 5min total before showing a retry CTA.

### Failed-mystery handling
If `GET /mysteries/:id` returns `status='failed'`, PlaybackScreen renders an error state (no audio, no transcript) showing `failure_reason` mapped to a kid-friendly message ("Couldn't write a fair mystery — try a different one?") with a "Back to mysteries" CTA. SolutionScreen is not reachable for failed mysteries.

## 9. Generation pipeline

The 4-phase orchestrator from `PLAN.md` §3-§4 carries over verbatim, with one structural change: it runs in-process instead of via BullMQ.

### Phase 1 — Logic Structure Agent
Input: `{category, difficulty, previousFailureNotes?}`. System prompt enforces age 8-13 voice, no real peril, structured JSON output matching the Zod schema. Difficulty controls clue counts (Easy: 3 essential + 1-2 false; Medium: 4 + 3-4; Hard: 5 + 5+). Up to 2 internal retries on Zod parse failure.

### Phase 2 — Validation Agent
Receives a `RedactedLogicStructure` (essential clues + characters [no `is_culprit`/`motive`] + setting only — NO `true_solution`, NO `false_clues`, NO `logic_chain`). Runs in a **fresh Anthropic call** with no memory of phase 1. Returns `{guess: {who, how, why}, reasoning, confidence}`.

`compareSolutions(guess, truth)`:
- `who`: exact match on character id (strict gate)
- `how`: semantic grader (small Claude call: "are these describing the same method? `{match, reason}`")
- `why`: same grader
- `confidence < 0.5` → fail even on match (clues weren't decisive)

`notes` is a human-readable mismatch description, fed back into phase 1 as `previousFailureNotes` on retry.

### Outer regen loop — 3 attempts max
On failure 3×, write mystery with `validation_passed=0`, `status='failed'`, `failure_reason='validation_exhausted'`. Frontend offers "try a new mystery."

### Phase 3 — Narrative Agent
Input: validated `LogicStructure` + difficulty. Output: `{title, narrative_text}`. System prompt enforces:
- Children's audiobook author voice
- Word-count target by difficulty: Easy=600, Medium=900, Hard=1200 (±15%)
- Tone calibrated to "cozy/mild-spooky" — no real peril, no harm, no real brands
- Each `essential_clues[i].description` woven into prose verbatim or as a clear paraphrase
- Title: 3-7 words, intriguing not scary

Post-generation **text-match check**: for each essential clue, fuzzy substring match (token-set ratio ≥ 0.75) against `narrative_text`. If any clue is missing, retry once with `previousFailureNotes` listing the missing clues. Cap at 2 narrative attempts; on exhaustion, mark failed with reason `narrative_clue_coverage`.

### Phase 4 — TTS
`TTSProvider.synthesize(text, {voice: 'fable'})` calls OpenAI `audio.speech.create({model: 'tts-1-hd', voice: 'fable', input: text})`, streams MP3 bytes, writes to `data/audio/<mystery_id>.mp3`. Sets `mysteries.audio_path = '<id>.mp3'`. Marks `status='ready'`, `ready_at=unixepoch()`.

The `TTSProvider` interface (`synthesize(text, opts) → AsyncIterable<Uint8Array>`) is preserved from `PLAN.md` §5 so swapping to ElevenLabs or local TTS later doesn't touch the orchestrator.

### Hint generation
`hintAgent.run({logic_structure, hints_already_given})`: takes the full LogicStructure plus prior hints, returns a single nudge that points at *one* essential clue without revealing who/how/why. System prompt: "You are a gentle guide. Reveal one clue's importance without naming the culprit, the method, or the motive. The kid has already seen these hints: {prior}. Output: one sentence."

### Explanation generation
After solution submit (or give-up), `explanationAgent.run({logic_structure, user_guess})` returns a 100-150 word kid-friendly paragraph tying the essential clues to the answer. Cached on `solutions.explanation`.

## 10. Milestones

| # | Milestone | Acceptance |
|---|---|---|
| **M1** | **Skeleton & deploy.** pnpm workspace; Fastify server with health route; SQLite + Drizzle + initial migration creating all 5 tables; player seed script; React/Vite frontend served from same Fastify process; PlayerPicker + MainScreen UI (no real generation); stub `/generate` returns canned data after 5s; Vitest configured (no tests yet); deploy script working end-to-end to `panther-golem.exe.xyz`; systemd unit running. | Visit `https://panther-golem.exe.xyz/` from iPad → pick player → pick category/difficulty → see fake mystery on PlaybackScreen after 5s loading. |
| **M2** | **Real logic + validation pipeline.** Anthropic client, all 4 system prompts, logicStructureAgent, validationAgent, graderAgent (how/why semantic match), `compareSolutions`, redact, 3-attempt regen loop, validation result persisted on every attempt. Vitest unit tests for Zod schema, redact, compareSolutions, and the regen loop with stubbed agents. | Run 20 generations (5 per category × 1 difficulty) with real Claude; ≥85% pass validation in ≤3 attempts. Failed runs persist `validation_passed=0` correctly. |
| **M3** | **Narrative + TTS.** narrativeAgent with text-match check + 2-attempt retry, OpenAI TTS integration, audioStorage writing to `data/audio/`, audio served via `/audio/:filename`, AudioPlayer + TranscriptPanel on PlaybackScreen, audio playback verified on iPad Safari (tap-to-start overlay, playbackRate, scrubber). | Full pipeline produces real audible mystery for all 4 categories × 3 difficulties. iPad Safari plays cleanly with speed control. |
| **M4** | **Clue tracker + solution flow.** Clue add/edit/delete with optimistic UI; SolutionScreen with character picker + how/why text fields; semantic grader for how/why; explanationAgent + caching; RevealPanel renders correct/partial/incorrect states. | Kid completes a full game loop (generate → listen → take notes → submit → see reveal). All three solution outcomes (correct, partial, incorrect) render correctly. |
| **M5** | **Hints, polish, ship.** hintAgent with ≤2-hint cap; give-up flow with confirmation; mobile-responsive iPad portrait + landscape; audio resume across reloads; "Switch player" UI; error boundaries on every screen; helpful error states for failed mysteries; favicon + page title. | Each kid plays 3 mysteries unaided in a single session; no broken state observed; deploy is one command. |

**Effort estimate:** ~2-3 weeks of part-time work for one developer.

## 11. Decisions log

The branches we chose and why, so future-me can re-evaluate without re-litigating:

| # | Decision | Why |
|---|---|---|
| 1 | Personal/family use, not public product | User context: building for own kids |
| 2 | Bare-minimum stack (SQLite, no queue, no S3, no auth, no telemetry) | "Goal is a simple game with my kids" — production infra adds 1-2 weeks of work nobody benefits from |
| 3 | Two players, ages 8 and 10, with player picker | Wide age spread → per-kid difficulty defaults + state isolation; no real auth needed |
| 4 | exe.dev VM `panther-golem.exe.xyz`, public URL | User has the VM; flipping to public-via-`share set-public` avoids iPad auth friction |
| 5 | OpenAI tts-1-hd (voice: fable as default) | User has OpenAI keys; ElevenLabs at $99/mo isn't worth it for personal use; tts-1-hd at ~$5-8/mo is plenty good |
| 6 | Claude Sonnet for all LLM work | Per `PLAN.md`; structured-JSON adherence + prompt caching for safety preamble |
| 7 | 4 categories MVP: Missing Pet, Haunted Mansion, Stolen Treasure, Locked-Room | Halves prompt-engineering surface area; mix of cozy + spooky for both kids |
| 8 | Solution input: character picker for "who" + free text for "how"/"why" | Removes spelling-failure mode for who; preserves reasoning for how/why |
| 9 | Two-tier hints: nudge clue + give up | 8yo on Hard will get stuck; "give up" prevents frustration session-end |
| 10 | No pre-generation; just show loading screen | Simpler; iterate to pre-gen if kids actually bounce |

## 12. Risks & open questions

- **Voice choice.** Defaulting to OpenAI **fable**. A/B with the kids in M3 — `nova` (warm female) and `onyx` (deep male) are alternates worth trying. Trivially swappable in env.
- **Story length tuning.** Targets are Easy=600w / Medium=900w / Hard=1200w. Adjustable via narrative system prompt without code changes. May need calibration after first 10 kid-listens.
- **Sonnet model version pinning.** Use `claude-sonnet-4-6` at build time. Pin in env, not hard-coded, so model upgrades don't require a code change.
- **Replay UX is undefined.** Solved mysteries sit in Recent list with ✓ badge. Tapping a solved one shows previous SolutionScreen result. Not a designed feature, just a behavior. Acceptable for MVP.
- **iPad Safari audio quirks.** Validated in M3 acceptance — tap-to-start overlay on first play; `audio.playbackRate` updates work; `audio.currentTime` restoration works.
- **exe.dev deploy fit.** Verified in M1 acceptance — Hello World responding at `panther-golem.exe.xyz` before building anything else.
- **Validation pass-rate floor.** Target 85%. If we miss badly on Hard difficulty, options: tighten Zod schema, increase regen attempts to 5, or fall back to Sonnet for narrative + Opus for logic structure.
- **Player names.** Spec uses generic P1/P2; real names go in `seed-players.ts` before deploy.
- **"Tests in M1" was deferred.** Vitest is set up but no tests are written until M2 where Zod/compareSolutions/regen-loop need them. Pragmatic for personal-scale work; revisit if regressions hurt.

---

## Appendix A — Environment variables

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=sk-...
OPENAI_TTS_MODEL=tts-1-hd
OPENAI_TTS_VOICE=fable
DATABASE_PATH=./data/mysterio.db
AUDIO_DIR=./data/audio
PORT=3000
NODE_ENV=production
```

## Appendix B — Key file contracts (load-bearing)

These are the contracts the rest of the codebase depends on. Rename or restructure with care.

- `packages/shared/src/types/logicStructure.ts` — exports `LogicStructure`, `EssentialClue`, `Character`, `TrueSolution`, `Difficulty`, `Category`, `Status`.
- `packages/shared/src/schemas/logicStructure.ts` — Zod, single source of truth (server validates Claude output, web validates form input).
- `apps/server/src/services/generation/orchestrator.ts` — `generateMystery(input, ctx): Promise<void>` (writes to DB; returns void; status read via DB)
- `apps/server/src/services/generation/agents/*Agent.ts` — `Agent<I, O> { run(input, ctx): Promise<O> }`
- `apps/server/src/services/generation/compareSolutions.ts` — `compareSolutions(guess, truth): Promise<{passed, notes}>`
- `apps/server/src/services/tts/openaiTts.ts` — implements `TTSProvider.synthesize(text, opts): AsyncIterable<Uint8Array>`
- `apps/server/src/db/schema.ts` — Drizzle schema, sole source of truth for tables
- `apps/web/src/hooks/useGenerationJob.ts` — `useGenerationJob(input): {mysteryId?, status, error}`
