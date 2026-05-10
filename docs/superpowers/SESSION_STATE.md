# Mysterio — Session State (M1 complete, paused 2026-05-10)

> M1 done. Stub mystery game is live on `panther-golem.exe.xyz` and verified working from iPad. Next session picks up at M2.1 (LogicStructure Zod schema). Re-invoke `superpowers:subagent-driven-development` when resuming.

## Where we are

- **Branch:** `feat/mysterio-implementation` (off `main`). Not merged or PR'd; M1 work has been committed sequentially on this branch.
- **Last commit:** `<close-out commit>` — M1.17 deploy notes + .gitignore.
- **Plan in flight:** `docs/superpowers/plans/2026-05-04-mysterio-implementation.md`.
- **Spec:** `docs/superpowers/specs/2026-05-04-mysterio-prd.md`.
- **Live URL:** `https://panther-golem.exe.xyz/` — public, exe.dev proxy at port 3000.
- **Execution mode:** subagent-driven (skill `superpowers:subagent-driven-development`); each task got fresh implementer + spec review + code-quality review.

## M1 completed (M1.1–M1.17)

All 17 tasks committed, all reviewed, all clean. Stub mystery flow works end-to-end on iPad.

| Task | Commit | Notes |
|---|---|---|
| M1.1 workspace bootstrap | `f0f506c` | clean |
| M1.2 shared package | `4b85f00` + `8731443` | clean |
| M1.3 Fastify + env + health | `1eaca23` → `34b61f1` | accepted deviations on TS strict-mode (rootDir, FastifyError type) |
| M1.4 SQLite + Drizzle + 5 tables | `4479dba` | clean |
| M1.5 player seed | `2ebae75` | seed uses `apps/server/.env` |
| M1.6 nanoid + stub generator | `c6b7a54` | clean |
| M1.7 players router | `f7810b8` | clean |
| M1.8 mysteries router (stub /generate) | `f6731ff` → `0e87c42` | unused-import + limit-clamp fix |
| M1.9 stale-row cleanup on boot | `b4a0279` | clean |
| M1.10 static file serving | `a14162f` → `1b9778b` | webDir path + mkdirSync |
| M1.11 Vite + React + react-router + react-query | `e900ac7` | clean |
| M1.12 API client wrappers | `5cc1b49` | clean |
| M1.13 PlayerPicker + zustand store | `7726019` | clean |
| M1.14 MainScreen | `740f90a` | clean |
| M1.15 useGenerationJob + Loading/Failed/Playback | `53e8259` | clean |
| M1.16 deploy script + systemd unit | `bf0be47` → `0a332b0` | dropped `--prod` from remote `pnpm install` (caught in code review) |
| M1.17 first deploy | `376f172` (ExecStart absolute path), `675756b` (env-file path) + close-out commit | both deviations were live-deploy fixes |

## M1.17 deploy notes (what bit during the live deploy)

These are the issues we hit running M1.17 for the first time. Captured here so M2 doesn't re-discover them.

1. **`pnpm deploy` is a built-in pnpm subcommand** (workspace deploy), not a script. Running our deploy via `bash scripts/deploy.sh` directly. (`pnpm run deploy` would also work but is verbose.) Plan-side TODO: rename the npm script away from `deploy` (e.g., `ship` or `deploy:vm`) so `pnpm <name>` is unambiguous.

2. **systemd-user PATH does not include `~/.local/bin`.** The plan's `ExecStart=/usr/bin/env node ...` failed because `env` couldn't find Node. Fix in `376f172`: `ExecStart=%h/.local/bin/node ...` (absolute path to the install location).

3. **exe.dev proxies to port 8000 by default.** Our server listens on 3000. Fixed at the proxy with `ssh exe.dev share port panther-golem 3000` (one-time per VM). Could alternatively set `PORT=8000` in `apps/server/.env`; the proxy-side change is more compatible with running locally on 3000.

4. **Corepack 0.29.4 (bundled with Node 22.11.0) has a known signature-verification bug** when fetching pnpm metadata. Workaround: `npm install -g corepack@latest` first, then `corepack prepare pnpm@9.12.0 --activate`. This needs to happen at VM provisioning time; M2 should add it to a one-time `scripts/bootstrap-vm.sh`.

5. **Dual-`.env` file path mismatch (deviation #6 from earlier session state — now resolved).** Root `.env` had `DATABASE_PATH=./data/mysterio.db` (resolves under `apps/server/data/` because the server runs from `apps/server` cwd). `apps/server/.env` had `DATABASE_PATH=../../data/mysterio.db` (resolves under `~/mysterio/data/`). `db:migrate` used `apps/server/.env` and created the DB at the latter; the running server read root `.env` and tried to open the former → "no such table: mysteries". Fix in `675756b`: systemd unit now points at `apps/server/.env` exclusively. Both running server and migrate/seed scripts now agree on `~/mysterio/data/mysterio.db`.

6. **`db:migrate` and `db:seed` are run on the VM** by the deploy script (under `bash -lc`). Both use `tsx` (a devDep) — that's why we dropped `--prod` from `pnpm install` in M1.16's `0a332b0`. Without that fix, deploy would have aborted at the migrate step.

7. **VM had a leftover unrelated `~/mysterio/` directory** from a different project ("The Illusionist's Shell Game"). Wiped before deploy. M2 should add an "is this dir empty" guard in deploy.sh, or document that `MYSTERIO_REMOTE_DIR` should be unique to this project per VM.

8. **Both `.env` files must be scp'd manually** before first deploy. `scripts/deploy.sh` excludes `.env` from rsync and only enforces `~/mysterio/.env` exists. We scp'd `~/mysterio/.env` AND `~/mysterio/apps/server/.env` separately. After fix #5 above, `~/mysterio/.env` (root) is unused by the running server but still required by deploy.sh's existence check. Could consolidate to single env file in M2 (recommended).

## Carry-forward open items for M2 onward

- **Consolidate to one `.env` file.** Currently two .env files exist; only `apps/server/.env` is meaningfully used. Drop root `.env` from local + deploy + the existence check, and have `bash scripts/deploy.sh` ensure `apps/server/.env` exists on the VM instead.
- **VM bootstrap script.** Pull #2/#4/#7 from the deploy notes into a separate `scripts/bootstrap-vm.sh` so re-provisioning isn't ad-hoc next time.
- **Rename `deploy` npm script** to avoid colliding with pnpm's built-in `deploy` subcommand.
- **systemctl --user from non-login SSH** errors with "Failed to connect to bus" because `XDG_RUNTIME_DIR` isn't set. Cosmetic: deploy.sh's `systemctl --user --no-pager status` may print a warning even when the service is fine. Could prefix the call with `XDG_RUNTIME_DIR=/run/user/$(id -u)`.
- **Pre-deploy decision (now decided):** data lives at `~/mysterio/data/` on the VM (sibling to apps/, packages/), matching what migrate creates with `apps/server/.env`'s relative path. Deviation #6 in earlier state file is resolved.

## Repo state on disk

- `apps/server/`: full Fastify app (health/players/mysteries-stub/static); SQLite at `data/mysterio.db` (apps/server/data/) locally; remote DB lives at `~/mysterio/data/mysterio.db`.
- `apps/server/systemd/mysterio.service`: ExecStart `%h/.local/bin/node`, env-file `%h/mysterio/apps/server/.env`.
- `apps/server/.env` (local): `DATABASE_PATH=../../data/mysterio.db`, `AUDIO_DIR=../../data/audio`. Same file is used on the VM with the same relative paths — they resolve to `~/mysterio/data/...` from the systemd `WorkingDirectory=%h/mysterio/apps/server`.
- `packages/shared/`: types + constants only. Zod schemas come in M2.1.
- `apps/web/`: full M1 SPA (PlayerPicker → MainScreen → PlaybackScreen for stub flow). `/mysteries/:id/solve` is still a Placeholder (M2+).
- `scripts/deploy.sh`: executable, uses `pnpm install --frozen-lockfile` (no `--prod`).
- `.env` (root) and `apps/server/.env`: present locally, gitignored. Both are present on the VM (root is currently unused by the running server but still required by deploy.sh's existence check — open item).

## VM state (panther-golem.exe.xyz)

- Linger=yes (service survives SSH disconnect).
- Node v22.11.0 at `~/.local/node-v22.11.0-linux-x64/`, symlinks in `~/.local/bin/`.
- Corepack upgraded to 0.34.7 (from 0.29.4) — pnpm@9.12.0 prepared+activated.
- exe.dev proxy on port 3000, public.
- mysterio.service enabled, running. PID rotates on each redeploy.
- DB at `~/mysterio/data/mysterio.db`, 2 player rows seeded.

## Next session — start at M2

M2 goal (per plan §M2 / line 2500): replace stub generator with real Phase 1 (logic structure) + Phase 2 (validation), incl. 3-attempt regen loop with feedback notes. Persist `validation_passed` and `validation_notes` on every attempt.

M2 acceptance: 20 generations (5 per category × 1 difficulty) against real Claude → ≥85% pass validation in ≤3 attempts.

First task: **M2.1 LogicStructure Zod schema in shared package** (plan line 2508). Three steps: type definitions, zod schemas with superRefine cross-field rules, index.ts export. Read the full task text from the plan when resuming.

**Resume checklist:**
1. `git status` — should be clean.
2. `git log --oneline -3` — confirm last commit is the M1.17 close-out.
3. `Skill('superpowers:subagent-driven-development')`.
4. Bump model from haiku → sonnet for M2 — Zod schema work involves real judgment (cross-field validation, edge cases for the validation grader, narrative grading prompts). Haiku worked for mechanical M1 plumbing but M2 is meaningfully more.
5. Open question to surface to user before M2.1: where should the regen loop's feedback notes feed in? The plan has an answer (`previousFailureNotes` arg on the logic-generation prompt) but it's worth confirming the user is aligned on the architecture before wiring it.

## Notes for the next session

- M1 close-out: 17 tasks landed in ~one calendar week of part-time work. Subagent-driven flow worked well; the two-stage review (spec then code-quality) caught real bugs (M1.16's `--prod` flag would've broken the first deploy).
- M1.17 deploy hit five distinct issues live (notes #1–#5 above). All fixed inline. The pattern is real: deploy plumbing is where assumptions surface. M2 should expect similar surprises when first wiring a real Claude API call (rate limits, prompt-cache misses, slow generations).
- For M2 the cost calculus changes — each generation hits the API. The plan's solvability suite is nightly, not per-PR (per CLAUDE.md). Keep it that way.
- Subagent prompts continue to inline full task text from the plan rather than pointing at a file.
- For code-quality review: pass BASE_SHA / HEAD_SHA so the reviewer scopes its diff. Provide literal task requirements text.
