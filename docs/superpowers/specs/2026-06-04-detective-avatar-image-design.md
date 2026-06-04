# Avatar Image Generation — Design Spec (Spec 2c)

_Date: 2026-06-04 · Status: approved for planning · Third of three sub-specs
decomposed from "Spec 2: Character creation + age"._

## Context

Final sub-spec of [Spec 2](2026-06-04-detective-accounts-design.md). **2a** (detective
accounts, shared stories, per-detective progress) and **2b** (age-range → generation)
are merged to `main`. 2a captured a free-text `avatar_description` on each detective but
did nothing with it. **2c turns that description into a generated avatar image** —
**mutable and regenerable**, unlike the immutable cover images.

It reuses the Spec 1b cover-image pipeline (the `gpt-image-1` `ImageProvider`, the image
storage + `/images/` static route, the `vi.mock` test pattern) and adds an
avatar-flavored prompt builder + agent, a new column, edit + generate routes, and avatar
rendering in the detective picker.

### What the user asked for (clarified)

- **Avatar from the kid's `avatar_description`** — the free text captured in 2a becomes a
  character portrait via `gpt-image-1`.
- **Explicit "Generate avatar" button** (brainstorm Q1) — NOT auto-generated on create.
  The kid taps a button and waits (~30s spinner). No background job, no avatar status
  column.
- **Full detective edit** (brainstorm Q2) — a new `PATCH /players/:id` edits `name`,
  `age_range`, `default_difficulty`, and `avatar_description` (2a had create + delete
  only, no edit).
- **Standalone Regenerate / re-roll** (brainstorm Q3) — because `gpt-image-1` is
  stochastic, a "Regenerate" button re-rolls the image from the *current* description
  without rewriting text. Saving a changed description also (re)generates.

### Design boundaries

- **Mutable, not immutable.** Covers are content-keyed (`{mysteryId}.png`) and cached
  `immutable` forever — they never change. Avatars change on every regen, so they need a
  cache-safe mutable scheme (see Components §1).
- **The button is the gate.** Cover generation is best-effort / non-gating (a failure
  leaves `cover_image_path` null and the UI falls back). Avatar generation is an explicit
  kid action, so its route **surfaces** success/failure (with retry), rather than
  swallowing errors.
- **No retroactive 2b effect.** Editing `age_range` only affects *future* mysteries —
  `mysteries.target_age_range` is snapshotted per-mystery at generate time (2b), so past
  mysteries keep their band.

## Architecture

Mirror **on-demand audio** (`POST /mysteries/:id/audio` → synchronously runs the TTS
agent, writes the file, returns) — the established precedent for explicit, kid-triggered,
synchronous media generation that takes seconds. Avatar generation is the same shape:

```
detective.avatar_description  (free text, from 2a)
        │  kid taps "Generate avatar" / "Regenerate"
        ▼
POST /players/:id/avatar  (synchronous, ~30s, spinner on web)
        ├──► runAvatarImageAgent({ playerId, description })
        │       ├─ buildAvatarPrompt(description)        portrait + safety clause
        │       ├─ OpenAiImageProvider.generate(..., {size:"1024x1024"})   gpt-image-1
        │       └─ writeAvatarImage(playerId, buf) → "avatars/{playerId}-{token}.png"
        │              (+ best-effort delete of the previous file)
        ├──► players.avatar_image_path = new key
        └──► returns updated Player
        ▼
GET /players → avatar_image_path ──► PlayerPicker <img src="/images/{key}">
```

The synchronous request holds open ~30s. This matches on-demand audio. **Open risk to
confirm during the live smoke:** the exe.dev proxy's request timeout. If ~30s exceeds it,
the fallback is an async job + a small poll (deferred unless the smoke shows it's needed).

## Components

### 1. Data + mutable storage

**Migration 0005** — add `avatar_image_path text` to the `players` table
(`apps/server/src/db/schema.ts`): **nullable, no CHECK constraint**. As in 2b's 0004,
this forces drizzle-kit to emit a native `ALTER TABLE \`players\` ADD COLUMN`, *not* a
table rebuild. This matters **more** than 2b: `players` is the parent of FK-cascade
children — `clues.player_id`, `solutions.player_id`, `hints.player_id` all
`ON DELETE CASCADE` (and `mysteries.player_id` `ON DELETE SET NULL`). A rebuild
(`DROP TABLE players` → recreate) would cascade-wipe every clue/solution/hint in the DB.
The plan verifies the generated SQL is an `ALTER` (no `__new_players`) with a guard test,
**and** runs the migration against a populated in-memory DB asserting child rows survive
(per `reference_sqlite_fk_migration_gotcha`).

**Mutable filename scheme.** Each generation:
- writes `avatars/{playerId}-{token}.png` under the existing `IMAGE_DIR` (a `token` is a
  short random id, e.g. `nanoid(8)`),
- stores that key in `players.avatar_image_path`,
- best-effort deletes the *previous* file (read the old `avatar_image_path` before
  overwriting; unlink it; ignore errors).

Because the served URL changes on every regen, the existing `/images/` static route's
`immutable` cache is **correct** — each `{playerId}-{token}.png` URL is genuinely
immutable; a re-roll yields a new URL, so browsers never serve a stale avatar. Served at
`/images/avatars/{playerId}-{token}.png` (the static route already serves subdirectories
of `IMAGE_DIR`). This mirrors how covers store a key and the API builds
`/images/{key}` — avatars store `avatars/{playerId}-{token}.png` and build the same way.

New storage helper `writeAvatarImage(playerId, buf): string` (returns the key) +
`deleteImageByKey(key): void` (best-effort unlink), parallel to `writeCoverImage`. Lives
in `apps/server/src/services/images/storage.ts`.

### 2. Avatar prompt + agent (reuses 1b)

**`buildAvatarPrompt(description: string): string`** — new builder parallel to
`buildCoverPrompt` (in `apps/server/src/services/images/style.ts` or a sibling
`avatarStyle.ts`). Reuses the **exact** child-safety clause from cover generation
("Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, no gore, no
weapons. No text, no words, no letters, and no numbers anywhere in the image."), but a
**character-portrait** style instead of a scene: a friendly storybook character portrait,
head-and-shoulders, soft golden-hour gouache, cozy and rounded, on a simple warm
background — then the kid's `avatar_description`. A `STYLE_VERSION` constant
(`avatar-v1`) tracks the style for future reskins (mirrors the cover `STYLE_VERSION`).

**`runAvatarImageAgent({ playerId, description }): Promise<Result>`** — mirrors
`coverImageAgent` (`apps/server/src/services/generation/agents/coverImageAgent.ts`):
`provider.generate(buildAvatarPrompt(description), { model, size: "1024x1024" })` →
`writeAvatarImage` → returns `{ ok: true; avatarImagePath } | { ok: false; error }`. Uses
the shared `defaultImageProvider` singleton. Square `1024×1024` (avatars are square; the
provider's `size` is per-call, defaulting to the cover landscape — pass the square size
explicitly). The agent is **non-throwing** (returns a result object) but, unlike covers,
the **route propagates the failure to the client**.

### 3. Routes (server)

In `apps/server/src/routes/players.ts`:

- **`PATCH /players/:id`** — body (all optional): `name`, `age_range`,
  `default_difficulty`, `avatar_description`. Zod-validated with the same enums/limits as
  POST (name trimmed, non-empty if present; `avatar_description` ≤ 300 chars, empty →
  null). Updates only the provided fields; returns the updated player. 404 if not found.
  **No image generation here** (fast metadata update).
- **`POST /players/:id/avatar`** — synchronous (re)generate. Loads the player; 404 if
  missing; **400 if `avatar_description` is null/empty** (nothing to draw). Calls
  `runAvatarImageAgent`; on success updates `avatar_image_path` (and deletes the old
  file), returns the updated player; on agent failure returns a 5xx/`{error}` the web can
  show with a retry. This single endpoint backs both "Generate" and "Regenerate".

`Player` shared type (`packages/shared/src/types/mystery.ts`) gains
`avatar_image_path: string | null`. The existing `GET /players` list and the POST-create
response include it (null on a fresh detective).

### 4. Web

- **`apps/web/src/api/players.ts`**: add `updatePlayer(id, patch)` → `PATCH /api/players/:id`,
  and `generateAvatar(id)` → `POST /api/players/:id/avatar`. Both return the updated
  `Player`.
- **Detective edit screen** — a new screen (or an `EditDetective` reusing the
  `CreateDetective` form fields) with name / age / difficulty / `avatar_description`
  inputs, an **avatar preview** (the current image, or the gradient-initial placeholder),
  and a **"Generate avatar" / "Regenerate"** button whose label flips on whether
  `avatar_image_path` exists. Tapping it calls `generateAvatar(id)` and shows a spinner
  for the ~30s call, then swaps in the new image. Saving the form `PATCH`es the fields;
  if `avatar_description` changed, the web then auto-fires `generateAvatar` (so a
  description edit produces a fresh image). Reached from `PlayerPicker`'s existing edit
  affordance.
- **`PlayerPicker`** (`apps/web/src/screens/PlayerPicker.tsx`): render
  `<img src="/images/{avatar_image_path}">` (rounded, cover-fit) when present; otherwise
  keep today's gradient circle with the name's first initial.

### 5. Testing

- **Unit — prompt**: `buildAvatarPrompt` includes the safety clause, the portrait style
  language, the woven-in description, and (via the agent) the square `1024×1024` size.
- **Unit — agent**: `runAvatarImageAgent` success path (provider + storage mocked via the
  hoisted `vi.mock` pattern from `coverImageAgent.test.ts`), provider-error path (returns
  `{ok:false}`, does not throw), storage-error path.
- **Unit — storage**: `writeAvatarImage` writes `avatars/{playerId}-{token}.png` and
  returns the key; `deleteImageByKey` unlinks and is a no-op on a missing file (real
  `mkdtemp`, per `storage.test.ts`).
- **Migration**: 0005 guard test (generated SQL is `ALTER TABLE`, contains no
  `__new_players` / `DROP TABLE \`players\``) **and** a populated-DB test that inserts a
  player + clues/solutions/hints, applies migrations, and asserts the children survive
  (the FK-cascade gotcha — load-bearing because `players` has cascade children).
- **Route**: `PATCH /players/:id` updates each field and 404s on unknown id;
  `POST /players/:id/avatar` sets `avatar_image_path` (provider mocked) and returns 400
  when `avatar_description` is empty; regeneration replaces the key and removes the prior
  file.
- **Web gate**: `pnpm --filter @mysterio/web typecheck` + `build` (no web test runner).
  Avatar render + the edit/generate flow verified in a real browser (per
  `reference_web_delete_gotchas` — curl masks interaction issues).
- **Live image smoke (COSTS REAL MONEY — ask the user first):** generate one real avatar
  from a description end-to-end on the deploy; confirm the portrait renders, the
  synchronous ~30s `POST` survives the exe.dev proxy timeout, regenerate produces a
  different image + a new URL (no stale cache), and the old file is cleaned up. This is
  also where the proxy-timeout open risk is resolved.

## Out of scope (noted)

- **No async job / avatar status column** — the synchronous on-demand model is
  intentional (matches audio). If the live smoke shows ~30s exceeds the exe.dev proxy
  timeout, an async-job + poll follow-up is the fallback, planned then.
- **No rate-limiting / generation quota** — kid-driven explicit button; cost guardrails
  are a future concern, not MVP (YAGNI). The live-smoke gate is the cost control for now.
- **No avatar in the in-story narrative or on mystery cards** — 2c is detective-profile
  only (picker + edit screen). Whether the detective's avatar appears elsewhere is a
  later UX call.

## Acceptance criteria

- A detective with a non-empty `avatar_description` can generate an avatar via an explicit
  button; the image appears in the picker and on the edit screen.
- "Regenerate" re-rolls a visibly different image from the same description, and the new
  image is served immediately (no stale cache); the previous file is removed.
- `PATCH /players/:id` edits name / age / difficulty / description; editing `age_range`
  does not alter any existing mystery's `target_age_range`.
- A detective with no description cannot generate (button disabled or 400); the picker
  falls back to the gradient initial.
- Migration 0005 applies to a populated DB without losing clue/solution/hint rows.
- All server unit + route tests pass; web typecheck + build pass.
