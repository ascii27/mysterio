# Mysterio — Session State (paused 2026-05-06, after M1.16)

> Pause point during M1 implementation via subagent-driven development. To resume, read this file, then re-invoke `superpowers:subagent-driven-development` and pick up at M1.17.

## Where we are

- **Branch:** `feat/mysterio-implementation` (off `main`)
- **Last good commit:** `0a332b0` — M1.16 follow-up (drop `--prod` from remote `pnpm install`)
- **Plan in flight:** `docs/superpowers/plans/2026-05-04-mysterio-implementation.md`
- **Spec:** `docs/superpowers/specs/2026-05-04-mysterio-prd.md`
- **Scope this run:** M1 only (17 tasks). Through M1 we land an iPad-reachable stub on `panther-golem.exe.xyz`.
- **Execution mode:** subagent-driven (skill `superpowers:subagent-driven-development`); each task gets a fresh implementer + spec review + code quality review.

## Completed tasks (M1.1–M1.16)

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
| M1.10 static file serving | `a14162f` → fix `1b9778b` | accepted deviation: `webDir = resolve("../web/dist")` not plan's `"./apps/web/dist"` (plan was buggy vs `apps/server/` cwd); also `mkdirSync(webDir, …)` added so server boots before M1.16 builds the web app |
| M1.11 web bootstrap — Vite + React + react-router + react-query | `e900ac7` | clean; placeholder routes only |
| M1.12 API client wrappers | `5cc1b49` | clean. `client.ts` (ApiError + generic `api<T>()`), `players.ts` (listPlayers), `mysteries.ts` (generate/get/list + MysteryDetail/PublicCharacter) |
| M1.13 PlayerPicker + zustand store | `7726019` | clean. Persists active player to localStorage under `mysterio.activePlayer`. Adds reusable `Button` component |
| M1.14 MainScreen | `740f90a` | clean. CategoryGrid (2x2 emoji), DifficultyPicker (3-button), RecentList (react-query). MainScreen orchestrates and fires `generateMystery` mutation |
| M1.15 useGenerationJob + Loading/Failed/Playback | `53e8259` | clean. Hook polls every 2s until `TERMINAL_STATUSES`. PlaybackScreen branches on status; ready state shows narrative + "I think I know!" link |
| M1.16 deploy script + systemd unit | `bf0be47` → fix `0a332b0` | accepted plan correction (ExecStart `dist/src/index.js` not `dist/index.js`, per the rootDir deviation); fix `0a332b0` removed `--prod` from remote `pnpm install` so `db:migrate`/`db:seed` get `tsx` and `drizzle-kit` (both devDeps). Code-quality review caught this before deploy |

## How to resume

Run these in order from `/Users/michaelgalloway/dev/mysterio`:

1. **Confirm git state.**
   ```bash
   git status
   git log --oneline -5
   git branch --show-current   # should show feat/mysterio-implementation
   ```
   Expected HEAD: `0a332b0 M1.16: drop --prod from remote pnpm install (db:migrate needs tsx/drizzle-kit)`.

2. **Re-invoke the skill** (it loads the prompt templates):
   `Skill('superpowers:subagent-driven-development')`

3. **Pick up at M1.17.** This is the only remaining M1 task and it's mostly manual — it requires the user in the loop:

   - **M1.17 First exe.dev deploy** (plan line 2426). Eight steps:
     1. `ssh -o StrictHostKeyChecking=accept-new panther-golem.exe.xyz 'echo ...'` — verify SSH works
     2. `scp .env panther-golem.exe.xyz:~/mysterio/.env` (then `chmod 600`) — provision env
     3. `ssh ... 'node --version'` — verify Node ≥22 (install if missing per plan)
     4. `ssh ... 'loginctl enable-linger $USER'` — keep service running without active SSH
     5. `ssh exe.dev share set-public panther-golem` — make URL public
     6. `pnpm deploy` from local — runs `scripts/deploy.sh`
     7. iPad smoke test at `https://panther-golem.exe.xyz/` — pick player → category → difficulty → Start → loading screen → fake narrative
     8. Optional empty commit with deploy notes

   M1.17 hits a public VM. Pause and ask the user how to drive it (they may run it themselves, or supervise the controller running each step).

4. **Open issue carrying into M1.17.** Likely-to-bite issue from the M1.16 review:

   - `db:migrate` uses `tsx --env-file=.env src/db/migrate.ts` from `apps/server/` cwd, so it expects `apps/server/.env` to exist on the VM. But the deploy script excludes `.env` from rsync and only enforces `~/mysterio/.env` (root) is present. Two paths to fix in M1.17:
     - (A) `scp` `apps/server/.env` to VM in addition to root `.env`, OR
     - (B) Change `db:migrate`/`db:seed` scripts to read root `.env` (e.g., `--env-file=../../.env`) — but that breaks local dev where the cwd-relative apps/server/.env is needed for path resolution.
   - **Recommendation:** in M1.17, scp `apps/server/.env` to the VM as well. Easier than re-plumbing env files. Plan deviation #5 already documents the local-dev rationale.

   - Also pre-deploy decision needed: where does data live in production? Per deviation #6, root `.env` `DATABASE_PATH=./data/mysterio.db` resolves to `apps/server/data/mysterio.db` since the server's WorkingDirectory is `apps/server/`. That's fine, just be aware.

## Cumulative deviations from the plan (carry forward)

These are intentional adaptations the plan should be updated to reflect:

1. `apps/server/tsconfig.json` `rootDir: "./"` (not `"./src"`). Reason: TS strict mode rejects `include`'d files outside `rootDir`.
2. `apps/server/src/index.ts` error handler uses `(err: FastifyError, ...)` (not bare `err`). Reason: TS strict mode infers `unknown` otherwise.
3. `apps/server/src/index.ts` registers `setErrorHandler` BEFORE route registration (cleaner Fastify idiom, also lets the handler catch errors during plugin registration).
4. `apps/server/src/routes/health.ts` does a real DB probe via `getSqlite().prepare("SELECT 1").run()` (M1.4 made this real, not a stub).
5. `apps/server/.env` exists locally with `DATABASE_PATH=../../data/mysterio.db` and `AUDIO_DIR=../../data/audio` so DB scripts run correctly from `apps/server/` cwd.
6. The root `.env` has `DATABASE_PATH=./data/mysterio.db` — relative to whatever cwd the production server runs from (which is `apps/server/`). Means data lives at `apps/server/data/mysterio.db` in production unless we change something. **TODO before deploy:** decide where data lives in production and update the env values consistently.
7. `start` script is `node --env-file=.env dist/src/index.js` (not `dist/index.js`) because `rootDir: "./"` makes TS mirror the path. The systemd unit uses the same path for the same reason.
8. M1.10 `apps/server/src/routes/static.ts`: `webDir = resolve("../web/dist")` (not plan's `"./apps/web/dist"`, which resolves wrong from `apps/server/` cwd) and `mkdirSync(webDir, { recursive: true })` added so `@fastify/static` doesn't crash before the web bundle exists.
9. M1.16 systemd unit ExecStart uses `dist/src/index.js` (not plan's `dist/index.js`) — same reason as deviation #7.
10. M1.16 deploy script uses `pnpm install --frozen-lockfile` (not plan's `pnpm install --prod --frozen-lockfile`). Reason: `db:migrate` and `db:seed` are run on the VM and they need `tsx` and `drizzle-kit`, both `devDependencies`. Caught by code-quality review on M1.16 before any deploy attempt.

## Repo state on disk

- `apps/server/`: full Fastify app (health/players/mysteries-stub/static); SQLite at `data/mysterio.db` with p1+p2 seeded. Production entry: `dist/src/index.js`.
- `apps/server/systemd/mysterio.service`: systemd user-unit for the VM.
- `packages/shared/`: types + constants (no Zod schemas yet — those come in M2.1).
- `apps/web/`: full M1 web app:
  - `api/` — `client.ts`, `players.ts`, `mysteries.ts` (M1.12)
  - `components/Button.tsx` (M1.13)
  - `state/playerStore.ts` — zustand + persist (M1.13)
  - `screens/PlayerPicker.tsx` (M1.13)
  - `screens/MainScreen/{MainScreen,CategoryGrid,DifficultyPicker,RecentList}.tsx` (M1.14)
  - `hooks/useGenerationJob.ts` (M1.15)
  - `screens/PlaybackScreen/{PlaybackScreen,LoadingMystery,FailedMystery}.tsx` (M1.15)
  - `routes.tsx` wires PlayerPicker / MainScreen / PlaybackScreen; `/mysteries/:id/solve` is still a Placeholder (lands in M2 or later)
- `apps/web/dist/`: present from M1.16 verification build (`pnpm build` was run).
- `scripts/deploy.sh`: executable (mode 0755).
- `data/mysterio.db`: present, has 2 player rows.
- `data/audio/`: present (created lazily on server boot).
- `.env` (root) and `apps/server/.env`: present locally (gitignored). **Neither has been scp'd to the VM yet** — that happens in M1.17 step 2.

## Task list (snapshot at pause)

Per the in-session task list:
- #1 [completed] M1.12 API client wrappers
- #2 [completed] M1.13 Player picker + player store
- #3 [completed] M1.14 MainScreen
- #4 [completed] M1.15 Generation hook + Loading/Failed/Playback stub
- #5 [completed] M1.16 Build pipeline + deploy script
- #6 [pending] M1.17 First exe.dev deploy

## Notes for the next session

- M1.12–M1.16 were all mechanical; haiku worked fine for implementer + both reviewers throughout. M1.16 review (haiku) caught a real Critical bug (`--prod` flag) that would have broken the first deploy — keep the two-stage review, especially the code-quality pass, for any task with shell/deploy/integration glue.
- M1.17 is partially-manual deploy. The user opted to pause rather than have the controller drive it. When resuming, ask the user how they want to drive M1.17 (run themselves vs. supervise controller vs. fully delegate) before invoking the skill on it. Likely they'll want to run interactively because it touches a real VM and requires iPad-side verification.
- The carry-forward issue most likely to bite during M1.17: `apps/server/.env` is needed on the VM for `db:migrate`/`db:seed` but isn't auto-deployed. See "Open issue" above. Prep an extra scp step.
- Subagent prompts are long because they inline the full task code from the plan — keep doing that.
- When using `superpowers:code-reviewer` subagent_type, pass BASE_SHA / HEAD_SHA as the previous-commit / current-commit pair so it can scope its diff. Provide the literal task requirements text, not just a pointer to the plan file.
