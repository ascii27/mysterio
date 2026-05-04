# Mysterio — Session State (paused 2026-05-04)

> Pause point during M1 implementation via subagent-driven development. To resume, read this file, then re-invoke `superpowers:subagent-driven-development` and continue from "Resume here."

## Where we are

- **Branch:** `feat/mysterio-implementation` (off `main`)
- **Last good commit:** `a14162f` — M1.10 (static file serving), but with a known unfixed bug (see open issues #1 below)
- **Plan in flight:** `docs/superpowers/plans/2026-05-04-mysterio-implementation.md`
- **Spec:** `docs/superpowers/specs/2026-05-04-mysterio-prd.md`
- **Scope this run:** M1 only (17 tasks). Through M1 we land an iPad-reachable stub on `panther-golem.exe.xyz`.
- **Execution mode:** subagent-driven (skill `superpowers:subagent-driven-development`); each task gets a fresh implementer + spec review + code quality review.

## Completed tasks (M1.1–M1.9)

All committed, all reviewed, all clean.

| Task | Commit | Notes |
|---|---|---|
| M1.1 workspace bootstrap | `f0f506c` | clean |
| M1.2 shared package | `4b85f00` + `8731443` (lockfile split) | clean |
| M1.3 Fastify + env + health | `1eaca23` → fixes `34b61f1` | accepted spec deviations: `rootDir: "./"` (TS strict mode requires it because `include` lists root-level config files); `FastifyError` type on error handler |
| M1.4 SQLite + Drizzle + 5 tables | `4479dba` | clean; `__drizzle_migrations` extra table is normal |
| M1.5 player seed | `2ebae75` | accepted deviation: `db:seed` script uses `--env-file=.env` (apps/server/.env) instead of plan's `--env-file=../../.env`, because root `.env`'s `DATABASE_PATH=./data/mysterio.db` resolves wrong from `apps/server/` cwd |
| M1.6 nanoid + stub generator | `c6b7a54` | clean |
| M1.7 players router | `f7810b8` | clean |
| M1.8 mysteries router (stub /generate) | `f6731ff` → fixes `0e87c42` | fixed: removed unused `solutions` import, clamp `limit` to ≥1 |
| M1.9 stale-row cleanup on boot | `b4a0279` | clean |

## In-progress task (M1.10) — DO NOT mark complete yet

- **Status:** Implementer finished and committed `a14162f`, but flagged a real bug. Spec + quality review **NOT YET RUN**.
- **Task list state:** Task #17 (M1.10) is `in_progress`.

### Open issue #1 — `webDir` path bug in `apps/server/src/routes/static.ts`

The plan literally specifies `const webDir = resolve("./apps/web/dist")`. This resolves relative to process cwd. Both the dev script (`tsx watch`) and the production systemd unit run with cwd `apps/server/`, so `./apps/web/dist` resolves to `apps/server/apps/web/dist` — which never exists.

**Recommended fix on resume:** change `resolve("./apps/web/dist")` to `resolve("../web/dist")`. From `apps/server/` cwd that resolves to `apps/web/dist` correctly.

### Open issue #2 — boot may crash on missing `apps/web/dist`

`apps/web/dist` doesn't exist yet (it's built in M1.11). `@fastify/static` may throw at registration when the root dir is missing. Two mitigations to consider when fixing #1:
- Add `mkdirSync(webDir, { recursive: true })` so the dir exists empty (parallel to the existing `mkdirSync(audioDir, …)`).
- Or guard the second `app.register(fastifyStatic, ...)` with `existsSync(webDir)`.

I had not yet verified whether the server actually boots in this state.

## How to resume

Run these in order from `/Users/michaelgalloway/dev/mysterio`:

1. **Confirm git state.**
   ```bash
   git status
   git log --oneline -5
   git branch --show-current   # should show feat/mysterio-implementation
   ```

2. **Re-invoke the skill** (it loads the prompt templates):
   `Skill('superpowers:subagent-driven-development')`

3. **Decide on the M1.10 fix.** Recommended: dispatch a single fix-implementer subagent with this prompt outline:
   - In `apps/server/src/routes/static.ts`, change `const webDir = resolve("./apps/web/dist")` → `const webDir = resolve("../web/dist")`.
   - Add `mkdirSync(webDir, { recursive: true })` after the existing `mkdirSync(audioDir, ...)` line so the server can boot before M1.11 builds the web app.
   - Briefly verify the server boots: `pnpm --filter @mysterio/server dev &; sleep 3; curl -s http://localhost:3000/api/health; kill %1`.
   - Commit: `M1.10: fix webDir path resolution and ensure dir exists for boot`.

4. **Run the M1.10 spec + quality review.** I had drafted the prompt but had not dispatched it when interrupted.

5. **Mark M1.10 complete (TaskUpdate #17 → completed) only after the review passes.**

6. **Resume M1.11–M1.17.** Tasks #18–#24 are pending in the task list. The plan has full text and code blocks for each.

## Cumulative deviations from the plan (carry forward)

These are intentional adaptations the plan should be updated to reflect:

1. `apps/server/tsconfig.json` `rootDir: "./"` (not `"./src"`). Reason: TS strict mode rejects `include`'d files outside `rootDir`.
2. `apps/server/src/index.ts` error handler uses `(err: FastifyError, ...)` (not bare `err`). Reason: TS strict mode infers `unknown` otherwise.
3. `apps/server/src/index.ts` registers `setErrorHandler` BEFORE route registration (cleaner Fastify idiom, also lets the handler catch errors during plugin registration).
4. `apps/server/src/routes/health.ts` does a real DB probe via `getSqlite().prepare("SELECT 1").run()` (M1.4 made this real, not a stub).
5. `apps/server/.env` exists locally with `DATABASE_PATH=../../data/mysterio.db` and `AUDIO_DIR=../../data/audio` so DB scripts run correctly from `apps/server/` cwd.
6. The root `.env` has `DATABASE_PATH=./data/mysterio.db` — relative to whatever cwd the production server runs from (which is `apps/server/`). Means data lives at `apps/server/data/mysterio.db` in production unless we change something. **TODO before deploy:** decide where data lives in production and update the env values consistently.
7. `start` script is `node --env-file=.env dist/src/index.js` (not `dist/index.js`) because `rootDir: "./"` makes TS mirror the path.
8. `start` script of M1.10 had `webDir` bug — see open issue #1 above.

## Repo state on disk

- `apps/server/`: full Fastify app with health, players, mysteries (stub), static routes; SQLite at `data/mysterio.db` with p1+p2 seeded.
- `packages/shared/`: types + constants (no Zod schemas yet — those come in M2.1).
- `apps/web/`: **does not exist yet**. M1.11 creates it.
- `data/mysterio.db`: present, has 2 player rows.
- `data/audio/`: lazily created by `static.ts` `mkdirSync` when route loads (will exist after first boot).
- `.env` (root) and `apps/server/.env`: present (gitignored).

## Task list (snapshot at pause)

```
#1–#7  completed (brainstorm/spec/plan meta-tasks)
#8–#16 completed (M1.1–M1.9)
#17 in_progress (M1.10 — needs fix + review)
#18–#24 pending (M1.11–M1.17)
```

## Notes for the next session

- Subagent prompts are getting long because they inline the full task code from the plan. That's per skill design ("Don't make subagent read plan file").
- Reviews on mechanical config tasks (M1.1, M1.2) found no issues; reviews on logic-bearing tasks (M1.3, M1.8, M1.10) caught real bugs each time. Worth keeping the two-stage review for the rest.
- I had been using haiku for implementer + reviewers when the user paused for a model switch midway (sonnet, then back to opus). Either model has worked. Haiku is the cheapest reasonable default for these mechanical tasks; bump to sonnet/opus only for tasks involving real judgment (M2 prompt engineering, M3 narrative tuning, M4 grader logic).
