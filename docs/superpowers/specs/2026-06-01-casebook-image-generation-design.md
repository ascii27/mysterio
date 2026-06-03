# Casebook Image Generation — Design Spec

_Date: 2026-06-01 · Status: approved for planning · Companion to
`2026-06-01-casebook-reskin-design.md`_

## Context

The "Maple Hollow Casebook" design handoff calls for AI-generated illustrations, and
the user's original ask included "we need to generate some of them from OpenAI API
calls." This spec adds a **real cover-image generation pipeline** to the
backend-wired app.

It is sequenced immediately after the **Casebook reskin** spec, which builds the
`SceneFrame` / `SceneArt` components as the placeholder + fallback layer this pipeline
feeds: `SceneFrame` renders the generated cover `<img>` when present, else falls back
to the procedural `SceneArt` SVG.

## Decisions (locked with the user)

- **What gets an image:** the **case cover only**. Suspects keep the reskin's
  `SceneArt`/monogram treatment (no portraits in this spec).
- **When:** **auto-generated during the async generation job** (not on-demand). Since
  there is exactly one image per case, this is one generation per mystery.
- **Consistency scope:**
  1. **App-wide art style** — one shared style preamble on every prompt. ✅
  2. **Within-case** — trivial here (one image per case). ✅
  3. **Cross-case character identity** (same person looks identical across cases) —
     **deferred**; it requires the recurring-cast / World model that doesn't exist yet
     (characters currently live inside each mystery's `logic_structure_json`, with no
     persistent character table).

## Codebase facts this design relies on

- DB is **SQLite** (Drizzle `sqliteTable`), **not** Postgres (the `CLAUDE.md` claim is
  stale). Audio is stored as a local **`mysteries.audio_path`** and served via a route
  — **not** S3/MinIO. Images mirror this exactly.
- The TTS feature is the template to mirror: `apps/server/src/services/tts/` =
  `provider.ts` (interface) + `openai.ts` (impl) + `storage.ts` + `index.ts`
  (selection) + `*.test.ts`, with an on-demand route (`routes/mysteryAudio.ts`) and a
  static-serving route (`routes/static.ts`).
- `OPENAI_API_KEY` already exists and is live (confirmed via TTS).
- The generation orchestrator (`services/generation/orchestrator.ts`) runs the
  phased pipeline; audio synthesis was moved auto → on-demand, so the cover step is the
  new auto media step. Exact phase wiring to be confirmed when the plan is written.
- The mystery DTO (GET `/mysteries/:id`) already exposes `audio_url`; it gains a
  parallel `cover_image_url`.

## Goals

- Generate one storybook **cover illustration per mystery**, in a single consistent
  art style, during the generation job.
- Make it **non-gating and best-effort**: an image failure never fails the mystery and
  never blocks `ready`; the frontend falls back to `SceneArt`.
- Keep it a **swappable adapter** behind an `ImageProvider` interface (don't bake
  OpenAI assumptions into the orchestrator), matching the TTS posture.
- **Cache forever** (generated once; immutable) like audio.

## Non-Goals

- No suspect/character portraits, no place/scene art (cover only).
- No cross-case character identity / persistent visual descriptors.
- No on-demand "generate image" button (it's automatic). A regenerate path is
  debug-only (see below), not a user feature.
- No parent-facing images on/off **UI** — that toggle is Spec 4 (Grown-ups Settings).
  This spec only leaves the **server hook** (a request flag) so Spec 4 can disable
  generation without further backend change.

## Design

### 1. Image service (`apps/server/src/services/images/`)

Mirror `services/tts/` one-to-one:

- **`provider.ts`** — `interface ImageProvider { generate(prompt: string, opts:
  GenerateImageOpts): Promise<Buffer> }`, where `GenerateImageOpts = { size: string;
  model: string }`. Returns PNG bytes.
- **`openai.ts`** — `OpenAIImageProvider` calling the OpenAI image API with
  `model = IMAGE_MODEL` (default `gpt-image-1`) and `size = IMAGE_SIZE`. Returns the
  decoded image buffer.
- **`storage.ts`** — `saveCoverImage(mysteryId, bytes): Promise<string>` writing to the
  same local media location pattern as `tts/storage.ts`, returning the stored path/key
  to persist in `cover_image_path`. Immutable; no cache-busting.
- **`style.ts`** — exports `STYLE_VERSION` and `buildCoverPrompt(mystery): string`.
  Wraps a **single shared style preamble** around case-specific, **spoiler-safe**
  content.
- **`index.ts`** — selects/exports the active provider (mirrors `tts/index.ts`).

### 2. Prompt + style consistency (`style.ts`)

- **Shared style preamble** (constant, versioned via `STYLE_VERSION`): a warm storybook
  detective illustration look — e.g. soft golden-hour gouache, cozy, rounded shapes,
  child-friendly, **non-violent, non-scary**, **no text/words/letters** in the image.
  App-wide consistency comes from this fixed preamble + consistent phrasing
  (`gpt-image-1` exposes no reliable seed).
- **Case-specific content, spoiler-safe:** built from `category`, `title`,
  `central_question`, and the setting — **never** the solution, culprit, or
  `true_solution`/`false_clues` data. The cover sets the scene; it must not reveal who
  did it.
- A short negative/safety clause (no gore, no weapons, age-appropriate) is always
  appended.

### 3. Pipeline integration (orchestrator)

- After the narrative passes its gate and the mystery is otherwise ready, run a
  **best-effort cover step**: `buildCoverPrompt` → `ImageProvider.generate` →
  `storage.saveCoverImage` → persist `cover_image_path`.
- **Non-gating:** wrap in try/catch; on any failure, log (structured) and leave
  `cover_image_path` null. The mystery still transitions to `ready`. (Image errors,
  rate limits, or moderation refusals must never fail a mystery.)
- Respect a `generateImage` flag on the generation request (default `true`); when
  false, skip the step entirely. This is the hook Spec 4's parent toggle will set.
- Generated once and cached forever; there is no automatic regeneration.

### 4. DB / API

- **Migration:** add `cover_image_path: text("cover_image_path")` to `mysteries`
  (nullable; mirrors `audio_path`). New Drizzle migration + snapshot.
- **DTO:** GET `/mysteries/:id` returns `cover_image_url` (built from
  `cover_image_path` the same way `audio_url` is built from `audio_path`), `null` when
  absent.
- **Serving:** serve the image file via the same mechanism audio uses (static route),
  with `Cache-Control: public, max-age=31536000, immutable`.

### 5. Frontend (the reskin/image seam)

- `PlaybackScreen` and `BriefingCard` pass `cover_image_url` to the reskin's
  `SceneFrame`: render the `<img>` when present, else the `SceneArt` fallback for the
  case's category/scene.
- No new screens or routes.

### 6. Config (`config/env.ts`)

- `IMAGE_MODEL` (default `gpt-image-1`), `IMAGE_SIZE` (landscape cover, default
  `1536x1024`). `OPENAI_API_KEY` already present.

### 7. Debug / regeneration

- Behind the existing debug posture only: a way to force-regenerate a cover for a
  mystery (e.g. a debug route or script), used when iterating on `style.ts`. Not a
  kid- or parent-facing feature.

## Testing

- **Unit:** `images/provider`/`openai` and `images/storage` tests with the OpenAI call
  **mocked** — no real API calls in CI (matches the "LLM/cost-heavy suites are nightly,
  not per-PR" discipline). `style.ts` test asserting the prompt includes the style
  preamble and **excludes** solution/culprit fields (spoiler-safety regression guard).
- **Orchestrator:** test that a thrown image error leaves `cover_image_path` null and
  the mystery still reaches `ready` (non-gating guarantee).
- **Manual:** one local live generation smoke (costs money) confirming a plausible,
  text-free, on-style, non-spoilery cover; visual check of `SceneFrame` showing the
  real cover and falling back to `SceneArt` when null.

## Risks / Notes

- **Latency & cost per mystery:** auto-generation adds one image call (seconds + $) to
  every mystery. Accepted per the user's "auto-generate everything" decision; the
  non-gating design caps the downside (failure ⇒ fast fallback, no broken mystery).
- **Moderation refusals:** `gpt-image-1` may refuse prompts it reads as scary. The
  child-friendly preamble reduces this; refusals are treated as best-effort failures
  (fallback to `SceneArt`), not errors.
- **Spoiler leakage:** the prompt builder must be carefully bounded to non-spoiler
  fields; the `style.ts` test enforces this.
- **Style drift over time:** `STYLE_VERSION` lets a future change to the preamble be
  tracked; existing covers are immutable and won't retro-update (acceptable).
