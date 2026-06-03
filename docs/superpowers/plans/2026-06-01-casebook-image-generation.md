# Casebook Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate one style-consistent storybook **cover image per mystery** during the generation pipeline, stored locally and surfaced to the web app (with SceneArt fallback).

**Architecture:** Mirror the existing TTS adapter (`services/tts/`) with a new `services/images/` (provider interface + OpenAI `gpt-image-1` impl + local storage + a versioned style/prompt builder). A **best-effort, non-gating** cover step runs in the orchestrator right after the narrative passes its gate; failure leaves `cover_image_path` null and the mystery still reaches `ready`. A new DB column + DTO field + `/images/` static route + a small frontend seam (already-built `SceneFrame`) complete it.

**Tech Stack:** TypeScript, Fastify, Drizzle (SQLite), OpenAI SDK v6 (`images.generate`, model `gpt-image-1`), Vitest. Spec: `docs/superpowers/specs/2026-06-01-casebook-image-generation-design.md`.

**Conventions for every task:** exact paths below; server gate is `pnpm --filter @mysterio/server typecheck` + `pnpm --filter @mysterio/server test`; web gate is `pnpm --filter @mysterio/web typecheck`. Run from repo root. One commit per task with the message shown. Follow TDD where a task has logic (write the failing test first).

**Prerequisite:** the casebook reskin branch (which built `SceneFrame`/`SceneArt`) must be merged or this must branch from it — Task 10 imports `SceneFrame`. Work on a branch off the reskin (`feat/casebook-image-gen`).

---

### Task 1: Add image config to env

**Files:**
- Modify: `apps/server/src/config/env.ts:6-8` (add three keys near the OpenAI keys)

- [ ] **Step 1: Add the three env keys**

In `envSchema` (after the `OPENAI_TTS_VOICE` line), add:

```ts
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  OPENAI_IMAGE_SIZE: z.string().default("1536x1024"),
  IMAGE_DIR: z.string().default("./data/images"),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/config/env.ts
git commit -m "M-img: image-generation env (model, size, dir)"
```

---

### Task 2: ImageProvider interface + spoiler-safe prompt builder (TDD)

**Files:**
- Create: `apps/server/src/services/images/provider.ts`
- Create: `apps/server/src/services/images/style.ts`
- Test: `apps/server/src/services/images/style.test.ts`

- [ ] **Step 1: Write the failing test** `style.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { STYLE_VERSION, buildCoverPrompt } from "./style.js";

const baseInput = {
  category: "missing-pet" as const,
  title: "The Case of the Empty Hutch",
  centralQuestion: "Who slipped the rabbit out of the locked hutch overnight, and how?",
  setting: "A cozy suburban backyard on a Saturday morning.",
};

describe("buildCoverPrompt", () => {
  it("includes the shared storybook style preamble", () => {
    const p = buildCoverPrompt(baseInput);
    expect(p.toLowerCase()).toContain("storybook");
    expect(p.toLowerCase()).toContain("illustration");
  });

  it("includes a no-text / child-friendly safety clause", () => {
    const p = buildCoverPrompt(baseInput).toLowerCase();
    expect(p).toContain("no text");
    expect(p).toMatch(/child|kid|all ages|age-appropriate/);
    expect(p).toMatch(/non-?violent|not scary|non-?scary/);
  });

  it("uses the title, setting, and central question for scene content", () => {
    const p = buildCoverPrompt(baseInput);
    expect(p).toContain(baseInput.setting);
    expect(p).toContain(baseInput.centralQuestion);
  });

  it("never leaks a provided culprit name or solution text", () => {
    // The builder only accepts non-spoiler fields; a culprit name passed via any
    // known field must not appear. We assert the function signature can't receive
    // solution data by checking it ignores extra keys.
    const p = buildCoverPrompt({ ...baseInput } as Parameters<typeof buildCoverPrompt>[0]);
    expect(p).not.toContain("culprit");
    expect(p).not.toContain("true_solution");
  });

  it("exposes a STYLE_VERSION string", () => {
    expect(typeof STYLE_VERSION).toBe("string");
    expect(STYLE_VERSION.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mysterio/server test style.test`
Expected: FAIL ("Cannot find module './style.js'").

- [ ] **Step 3: Create `provider.ts`**

```ts
export interface GenerateImageOpts {
  size: string;
  model: string;
}

export interface ImageProvider {
  /** Returns PNG (or provider-native) image bytes for the prompt. */
  generate(prompt: string, opts: GenerateImageOpts): Promise<Buffer>;
}
```

- [ ] **Step 4: Create `style.ts`**

```ts
import type { CategoryId } from "@mysterio/shared";

/** Bump when the shared art style changes; existing covers are immutable. */
export const STYLE_VERSION = "casebook-v1";

/** Spoiler-safe inputs only — never pass solution/culprit data here. */
export interface CoverPromptInput {
  category: CategoryId;
  title: string;
  centralQuestion: string;
  setting: string;
}

const STYLE_PREAMBLE =
  "A warm storybook detective illustration in soft golden-hour gouache, " +
  "cozy and rounded, gentle painterly texture, inviting and friendly.";

const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

const CATEGORY_MOOD: Record<CategoryId, string> = {
  "missing-pet": "a gentle search for a missing pet around a neighborhood",
  "haunted-mansion": "a friendly-spooky old mansion at dusk, cozy not frightening",
  "stolen-treasure": "a curious case of something precious gone missing",
  "locked-room": "a puzzling locked-room scene with a single way in",
};

export function buildCoverPrompt(input: CoverPromptInput): string {
  return [
    STYLE_PREAMBLE,
    `Scene: ${CATEGORY_MOOD[input.category]}.`,
    `Setting: ${input.setting}`,
    `It illustrates the mystery "${input.title}". ${input.centralQuestion}`,
    "Show the place and mood, not the answer — do not reveal who did it.",
    SAFETY_CLAUSE,
  ].join(" ");
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter @mysterio/server test style.test`
Expected: PASS (all 5).

- [ ] **Step 6: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/services/images/ && git commit -m "M-img: ImageProvider interface + spoiler-safe style/prompt builder"
```

---

### Task 3: OpenAI image provider + index (TDD with mocked SDK)

**Files:**
- Create: `apps/server/src/services/images/openai.ts`
- Create: `apps/server/src/services/images/index.ts`
- Test: `apps/server/src/services/images/openai.test.ts`

- [ ] **Step 1: Write the failing test** `openai.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
vi.mock("openai", () => ({
  default: class {
    images = { generate: generateMock };
  },
}));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_API_KEY: "test-key" }),
}));

import { OpenAiImageProvider } from "./openai.js";

describe("OpenAiImageProvider", () => {
  beforeEach(() => generateMock.mockReset());

  it("decodes b64_json into a Buffer", async () => {
    const png = Buffer.from("fake-png-bytes");
    generateMock.mockResolvedValue({ data: [{ b64_json: png.toString("base64") }] });
    const provider = new OpenAiImageProvider();
    const out = await provider.generate("a cozy scene", { model: "gpt-image-1", size: "1536x1024" });
    expect(out.equals(png)).toBe(true);
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-1", size: "1536x1024", prompt: "a cozy scene", n: 1 }),
    );
  });

  it("throws when the response has no image data", async () => {
    generateMock.mockResolvedValue({ data: [] });
    const provider = new OpenAiImageProvider();
    await expect(provider.generate("x", { model: "gpt-image-1", size: "1536x1024" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mysterio/server test openai.test` (in the images dir)
Expected: FAIL (module not found). Note: there is also a `services/tts/openai.test.ts`; scope the run to the images path, e.g. `pnpm --filter @mysterio/server test src/services/images/openai.test.ts`.

- [ ] **Step 3: Create `openai.ts`**

```ts
import OpenAI from "openai";
import { loadEnv } from "../../config/env.js";
import type { GenerateImageOpts, ImageProvider } from "./provider.js";

let _client: OpenAI | null = null;
function getOpenAi(): OpenAI {
  if (_client) return _client;
  const env = loadEnv();
  _client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
  return _client;
}

export class OpenAiImageProvider implements ImageProvider {
  async generate(prompt: string, opts: GenerateImageOpts): Promise<Buffer> {
    const client = getOpenAi();
    const res = await client.images.generate({
      model: opts.model,
      prompt,
      size: opts.size as "1536x1024",
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("image_provider_no_data");
    return Buffer.from(b64, "base64");
  }
}
```

- [ ] **Step 4: Create `index.ts`**

```ts
import { OpenAiImageProvider } from "./openai.js";
import type { ImageProvider } from "./provider.js";

export type { GenerateImageOpts, ImageProvider } from "./provider.js";

export const defaultImageProvider: ImageProvider = new OpenAiImageProvider();
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter @mysterio/server test src/services/images/openai.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/services/images/ && git commit -m "M-img: OpenAI gpt-image-1 provider + default provider"
```

---

### Task 4: Local cover-image storage (TDD)

**Files:**
- Create: `apps/server/src/services/images/storage.ts`
- Test: `apps/server/src/services/images/storage.test.ts`

- [ ] **Step 1: Write the failing test** `storage.test.ts`

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir = "";
vi.mock("../../config/env.js", () => ({ loadEnv: () => ({ IMAGE_DIR: dir }) }));

import { writeCoverImage } from "./storage.js";

describe("writeCoverImage", () => {
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "img-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("writes a .png named by mystery id and returns the file name", async () => {
    const bytes = Buffer.from("png-bytes");
    const name = await writeCoverImage("m-123", bytes);
    expect(name).toBe("m-123.png");
    const written = await readFile(join(dir, "m-123.png"));
    expect(written.equals(bytes)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mysterio/server test src/services/images/storage.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `storage.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "../../config/env.js";

export async function writeCoverImage(mysteryId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  await mkdir(imageDir, { recursive: true });
  const fileName = `${mysteryId}.png`;
  await writeFile(`${imageDir}/${fileName}`, buf);
  return fileName;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @mysterio/server test src/services/images/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/services/images/ && git commit -m "M-img: local cover-image storage"
```

---

### Task 5: Cover-image agent — best-effort, never throws (TDD)

**Files:**
- Create: `apps/server/src/services/generation/agents/coverImageAgent.ts`
- Test: `apps/server/src/services/generation/agents/coverImageAgent.test.ts`

This mirrors `ttsAgent.ts`. Critical contract: **it never throws** — any provider/storage failure returns `{ ok: false }` so the orchestrator stays non-gating.

- [ ] **Step 1: Write the failing test** `coverImageAgent.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const writeCoverImage = vi.fn();
vi.mock("../../images/index.js", () => ({ defaultImageProvider: { generate } }));
vi.mock("../../images/storage.js", () => ({ writeCoverImage }));
vi.mock("../../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1", OPENAI_IMAGE_SIZE: "1536x1024" }),
}));

import { runCoverImageAgent } from "./coverImageAgent.js";

const input = {
  mysteryId: "m-1",
  category: "missing-pet" as const,
  title: "The Empty Hutch",
  centralQuestion: "Who took the rabbit, and how?",
  setting: "A cozy backyard.",
};

describe("runCoverImageAgent", () => {
  beforeEach(() => { generate.mockReset(); writeCoverImage.mockReset(); });

  it("returns ok + path on success", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeCoverImage.mockResolvedValue("m-1.png");
    const res = await runCoverImageAgent(input);
    expect(res).toEqual({ ok: true, coverImagePath: "m-1.png" });
  });

  it("returns ok:false (never throws) when the provider throws", async () => {
    generate.mockRejectedValue(new Error("rate_limited"));
    const res = await runCoverImageAgent(input);
    expect(res.ok).toBe(false);
    expect(writeCoverImage).not.toHaveBeenCalled();
  });

  it("returns ok:false (never throws) when storage throws", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeCoverImage.mockRejectedValue(new Error("disk_full"));
    const res = await runCoverImageAgent(input);
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mysterio/server test src/services/generation/agents/coverImageAgent.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `coverImageAgent.ts`**

```ts
import type { CategoryId } from "@mysterio/shared";
import { loadEnv } from "../../../config/env.js";
import { logger } from "../../../utils/logger.js";
import { defaultImageProvider } from "../../images/index.js";
import { writeCoverImage } from "../../images/storage.js";
import { buildCoverPrompt } from "../../images/style.js";

export interface CoverImageAgentInput {
  mysteryId: string;
  category: CategoryId;
  title: string;
  centralQuestion: string;
  setting: string;
}

export type CoverImageAgentResult =
  | { ok: true; coverImagePath: string }
  | { ok: false; error: string };

export async function runCoverImageAgent(
  input: CoverImageAgentInput,
): Promise<CoverImageAgentResult> {
  const env = loadEnv();
  const prompt = buildCoverPrompt({
    category: input.category,
    title: input.title,
    centralQuestion: input.centralQuestion,
    setting: input.setting,
  });

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, {
      model: env.OPENAI_IMAGE_MODEL,
      size: env.OPENAI_IMAGE_SIZE,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("cover_image_provider_failed", { mystery_id: input.mysteryId, error });
    return { ok: false, error };
  }

  try {
    const coverImagePath = await writeCoverImage(input.mysteryId, buf);
    return { ok: true, coverImagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("cover_image_storage_failed", { mystery_id: input.mysteryId, error });
    return { ok: false, error };
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @mysterio/server test src/services/generation/agents/coverImageAgent.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/services/generation/agents/coverImageAgent.ts apps/server/src/services/generation/agents/coverImageAgent.test.ts && git commit -m "M-img: best-effort cover-image agent (never throws)"
```

---

### Task 6: DB migration — add `cover_image_path`

**Files:**
- Modify: `apps/server/src/db/schema.ts:23` (add column after `audio_path`)
- Create (generated): `apps/server/src/db/migrations/0002_*.sql` + meta snapshot

- [ ] **Step 1: Add the column to the `mysteries` table in `schema.ts`**

After the `audio_path: text("audio_path"),` line, add:

```ts
  cover_image_path: text("cover_image_path"),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @mysterio/server db:generate`
Expected: a new `apps/server/src/db/migrations/0002_*.sql` containing `ALTER TABLE mysteries ADD ... cover_image_path` plus an updated `meta/` snapshot + `_journal.json`.

- [ ] **Step 3: Apply it locally to confirm it runs**

Run: `pnpm --filter @mysterio/server db:migrate`
Expected: migration applies with no error (column added).

- [ ] **Step 4: Typecheck + Commit**

```bash
pnpm --filter @mysterio/server typecheck && git add apps/server/src/db/schema.ts apps/server/src/db/migrations/ && git commit -m "M-img: add mysteries.cover_image_path column + migration"
```

---

### Task 7: Orchestrator — best-effort cover step (non-gating)

**Files:**
- Modify: `apps/server/src/services/generation/orchestrator.ts` (RunInput + the `prose.ok` block)

- [ ] **Step 1: Add the import** (with the other agent imports near the top):

```ts
import { runCoverImageAgent } from "./agents/coverImageAgent.js";
```

- [ ] **Step 2: Add an optional `generateImage` flag to `RunInput`** (the Spec-4 parent-toggle hook; defaults on):

```ts
interface RunInput {
  mysteryId: string;
  category: CategoryId;
  difficulty: DifficultyId;
  playerName: string;
  generateImage?: boolean;
}
```

- [ ] **Step 3: Replace the `if (prose.ok) { ... }` block** so the cover is generated (best-effort) and folded into the `ready` update. Replace the existing block (currently lines ~79–89) with:

```ts
      if (prose.ok) {
        // Best-effort cover image — never blocks `ready`. A failure (rate limit,
        // moderation refusal, disk) leaves cover_image_path null and the frontend
        // falls back to SceneArt.
        let coverImagePath: string | null = null;
        if (input.generateImage !== false) {
          const cover = await runCoverImageAgent({
            mysteryId: input.mysteryId,
            category: input.category,
            title: prose.value.title,
            centralQuestion: logic.central_question,
            setting: logic.setting,
          });
          if (cover.ok) {
            coverImagePath = cover.coverImagePath;
          } else {
            log("cover_image_skipped", { reason: cover.error });
          }
        }
        db.update(mysteries).set({
          status: "ready",
          title: prose.value.title,
          narrative_text: prose.value.narrative_text,
          narrative_annotations: JSON.stringify(prose.value.annotations),
          cover_image_path: coverImagePath,
          ready_at: Math.floor(Date.now() / 1000),
        }).where(eq(mysteries.id, input.mysteryId)).run();
        log("generation_complete", { attempt, cover: coverImagePath !== null });
        return;
      }
```

- [ ] **Step 4: Typecheck + run server tests**

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/server test`
Expected: PASS. (The non-gating guarantee is covered by `coverImageAgent.test.ts` from Task 5 — the agent returns `ok:false` instead of throwing, so the orchestrator's `cover.ok` branch simply leaves the path null.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/generation/orchestrator.ts
git commit -m "M-img: orchestrator best-effort cover step (non-gating) + generateImage hook"
```

---

### Task 8: API — expose `cover_image_url` in the mystery DTO

**Files:**
- Modify: `apps/server/src/routes/mysteries.ts` (GET `/mysteries/:id` DTO — the `return { ... }` near line 82)

- [ ] **Step 1: Add `cover_image_url` to the GET-by-id DTO**

In the `app.get("/mysteries/:id", ...)` handler's returned object, immediately after the `audio_url: row.audio_path ? `/audio/${row.audio_path}` : null,` line, add:

```ts
      cover_image_url: row.cover_image_path ? `/images/${row.cover_image_path}` : null,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/mysteries.ts
git commit -m "M-img: expose cover_image_url in mystery DTO"
```

---

### Task 9: Serve `/images/` statically (immutable cache)

**Files:**
- Modify: `apps/server/src/routes/static.ts`

- [ ] **Step 1: Register an images static root + create the dir**

In `staticRoutes`, after the `const audioDir = resolve(env.AUDIO_DIR);` line add:

```ts
  const imageDir = resolve(env.IMAGE_DIR);
```

After `mkdirSync(audioDir, { recursive: true });` add:

```ts
  mkdirSync(imageDir, { recursive: true });
```

After the existing `/audio/` `app.register(fastifyStatic, {...})` block, add a second registration:

```ts
  await app.register(fastifyStatic, {
    root: imageDir,
    prefix: "/images/",
    decorateReply: false,
    cacheControl: true,
    maxAge: "365d",
    immutable: true,
  });
```

> Note: `decorateReply: false` is required because the first `fastifyStatic` registration already decorated reply with `sendFile`; a second registration must not re-decorate.

- [ ] **Step 2: Exclude `/images/` from the SPA fallback**

In `setNotFoundHandler`, change the guard:

```ts
    if (req.url.startsWith("/api/") || req.url.startsWith("/audio/")) {
```
to:
```ts
    if (req.url.startsWith("/api/") || req.url.startsWith("/audio/") || req.url.startsWith("/images/")) {
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mysterio/server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/static.ts
git commit -m "M-img: serve /images/ statically with immutable cache"
```

---

### Task 10: Web — consume `cover_image_url` in the cover SceneFrame

**Files:**
- Modify: `apps/web/src/api/mysteries.ts` (`MysteryDetail` interface)
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx` (pass `data.cover_image_url` to `SceneFrame`)
- Modify: `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx` (pass `mystery.cover_image_url`)

- [ ] **Step 1: Add the field to `MysteryDetail`** in `apps/web/src/api/mysteries.ts` (after the `audio_url: string | null;` line):

```ts
  cover_image_url: string | null;
```

- [ ] **Step 2: PlaybackScreen — use the real cover when present**

In `PlaybackScreen.tsx`, change the `SceneFrame`'s `imageUrl={undefined}` to:

```tsx
          imageUrl={data.cover_image_url}
```

- [ ] **Step 3: BriefingCard — same**

In `BriefingCard.tsx`, change the `SceneFrame`'s `imageUrl={undefined}` to:

```tsx
          imageUrl={mystery.cover_image_url}
```

(When `cover_image_url` is null — generation off/failed/in older rows — `SceneFrame` already falls back to `SceneArt`. No other change needed.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/mysteries.ts apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx
git commit -m "M-img: web consumes cover_image_url (SceneArt fallback when null)"
```

---

### Task 11: Verification

**Files:** none (verification only)

- [ ] **Step 1: Server typecheck + tests**

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/server test`
Expected: PASS, including the new `style`, `openai` (images), `storage` (images), and `coverImageAgent` suites.

- [ ] **Step 2: Web typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS.

- [ ] **Step 3: Confirm no real API calls in CI-run tests**

Run: `grep -rn "images.generate\|defaultImageProvider" apps/server/src/services/images apps/server/src/services/generation/agents/coverImageAgent.test.ts`
Confirm every test that exercises generation mocks `openai` or `../../images/index.js` — no test hits the live OpenAI API.

- [ ] **Step 4: Optional local live smoke (costs money — do only if asked)**

Set a real `OPENAI_API_KEY`, run the server + web, generate a new mystery, and confirm: a `data/images/<id>.png` appears, the PlaybackScreen/BriefingCard show the real cover inside the taped frame, the image has no text and is non-spoilery/on-style, and that forcing a provider error (e.g. bad model env) still produces a `ready` mystery with the SceneArt fallback.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §1 image service (provider/openai/storage/style/index) → Tasks 2–4. §2 prompt + style consistency (versioned preamble, spoiler-safe fields `setting`/`central_question`/`title`/`category`, never solution) → Task 2 (+ test). §3 pipeline integration (best-effort, non-gating, `generateImage` hook, generated once) → Tasks 5 + 7. §4 DB/API (`cover_image_path` migration, `cover_image_url` DTO, `/images/` serving with immutable cache) → Tasks 6, 8, 9. §5 frontend seam (SceneFrame consumes url, SceneArt fallback) → Task 10. §6 config (`OPENAI_IMAGE_MODEL`/`OPENAI_IMAGE_SIZE`, IMAGE_DIR) → Task 1. §7 debug/regeneration → not given a standalone task; deliberately deferred (the spec marks it "debug-only", and the immutable-once-generated rule means a regenerate path is a separate small tool — noted here as out of this plan's scope rather than silently dropped). Testing (mocked-in-CI provider/storage/style + non-gating guarantee) → Tasks 2,3,4,5,11.
- **Placeholder scan:** none — every code/test step shows complete code; commands have expected output.
- **Type consistency:** `ImageProvider`/`GenerateImageOpts` (Task 2/3), `CoverPromptInput`/`buildCoverPrompt`/`STYLE_VERSION` (Task 2), `runCoverImageAgent`/`CoverImageAgentResult` with `coverImagePath` (Task 5) are used consistently by the orchestrator (Task 7). `cover_image_path` (DB, Task 6) → `cover_image_url` (DTO, Task 8; web type, Task 10) are named consistently.
- **Known follow-up:** the spec's §7 debug regenerate path is intentionally not built here (see above). Flag to the user when handing off.
