# Spec 3d — World Surfaces (Town, Who's Who, detail + portraits) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn 3c's World data into the full, explorable Maple Hollow — character & place image pipeline (gpt-image-1), a Town screen with a hotspot map, an upgraded Who's Who directory, and character/place detail pages — all cross-linked and spoiler-safe.

**Architecture:** Backend mirrors the proven avatar image pipeline exactly (per-entity gpt-image-1 generator → versioned local path → DB column → static `/images/` serving → synchronous regenerate POST), plus an idempotent, fail-soft backfill script wired into `deploy.sh` that generates the seed roster's portraits, all place images, and one town-map illustration. Frontend adds four casebook-styled React screens (Town, Who's Who upgrade, character detail, place detail) reusing existing casebook primitives + tokens; images fall back to monogram/SceneArt so nothing ever hard-depends on a generated asset. No generation-pipeline or solvability changes (that was all 3c).

**Tech Stack:** Fastify + drizzle-orm (Postgres), `services/images` (OpenAI gpt-image-1 provider behind an `ImageProvider` interface), Zod DTOs in `packages/shared`, React + Vite + TanStack Query + react-router + zustand in `apps/web` (inline styles, casebook CSS tokens), vitest + pg-mem for server tests.

---

## User-confirmed scope decisions (2026-06-21)

These resolve the spec's three open questions:
1. **Place images: REAL.** Generate gpt-image-1 images for all 9 seed places (not SceneArt placeholders). Place image generator + regenerate endpoint + backfill.
2. **Image backfill: AUTO ON DEPLOY.** A backfill script generates all missing character portraits + place images + the town map, run from `deploy.sh`. **Idempotent** — it only generates for rows whose image path is still null (and only generates the map if the file is missing), so re-deploys never re-spend. Until an image exists, the UI shows the monogram / SceneArt fallback.
3. **Map: ONE AUTHORED MAP IMAGE.** A single generated town-map illustration (`world/town-map.png`) rendered as the Town screen's map background, with CSS-positioned labeled hotspot pins at hand-authored coordinates routing to place detail. Pins carry place names (so they need not align with drawn buildings). Missing map → parchment/SceneArt fallback (non-gating).

## Critical constraints (read before starting)

- **Spec source of truth:** `docs/superpowers/specs/2026-06-08-3d-world-surfaces-design.md`. 3d is **purely additive presentation** over 3c — do NOT touch the generation pipeline, `logic_structure_json`, validation/prose/readthrough, or `extractAppearances`.
- **Spoiler rule (kids' game — critical) carries through every new read.** `is_culprit`/`motive` for a case the requesting player hasn't resolved (`solutions.is_correct = true OR gave_up = true`) is NEVER exposed. Place detail exposes only `title` + a player `solved` flag — never any solution. Image prompts must NEVER reference culprit status.
- **Fail-soft like the avatar/cover pipeline.** Every image generator returns `{ ok: false, error }` and never throws on provider/storage failure. The backfill logs and continues past any single failure. The UI always has a non-image fallback.
- **Mirror the avatar pattern exactly** (`services/images/avatarImageAgent.ts`, `avatarStyle.ts`, `storage.ts:writeAvatarImage`, the `POST /players/:id/avatar` route in `routes/players.ts`). Don't invent a new shape.
- **Idempotent backfill.** Generate only when the path column is null (characters/places) or the file is absent (map). This is the cost guard — re-running on every deploy must be a no-op once populated.
- **ESM `.js` import specifiers** everywhere (even from `.ts`). pg-mem is the server test harness. `apps/web` has NO test runner — gates are typecheck + vite build (+ manual/iPad verification).
- **Existing 3c facts you build on (verified):** `routes/characters.ts` already returns `portrait_image_path` in both list and detail — portraits "just work" in the web once generated; only the regenerate POST is new for characters. `routes/places.ts` returns `{ id, name, description, image_path }` (list only; no detail route yet). The 9 seed place ids are fixed (generation never creates new places): `maple-diner`, `town-library`, `clocktower-square`, `general-store`, `the-bakery`, `millpond`, `schoolhouse`, `garage`, `post-office`.
- **Commands:** server tests `pnpm --filter @mysterio/server test`; server typecheck `pnpm --filter @mysterio/server typecheck`; shared `pnpm --filter @mysterio/shared {test,build,typecheck}`; web `pnpm --filter @mysterio/web {typecheck,build}`. Run `pnpm --filter @mysterio/shared build` before web typecheck when shared DTOs changed (web consumes `dist`).

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/shared/src/types/world.ts` | add `PlaceCase`, `PlaceDetail` DTOs | 1 |
| `apps/server/src/services/images/portraitStyle.ts` | `buildPortraitPrompt` | 2 |
| `apps/server/src/services/images/characterPortraitAgent.ts` | `runCharacterPortraitAgent` (fail-soft) | 2 |
| `apps/server/src/services/images/placeStyle.ts` | `buildPlaceImagePrompt` | 3 |
| `apps/server/src/services/images/placeImageAgent.ts` | `runPlaceImageAgent` (fail-soft) | 3 |
| `apps/server/src/services/images/townMapAgent.ts` | `runTownMapAgent` + `townMapExists` (fail-soft) | 4 |
| `apps/server/src/services/images/storage.ts` | add `writePortraitImage`, `writePlaceImage`, `writeWorldImage` | 2,3,4 |
| `apps/server/src/routes/characters.ts` | add `POST /characters/:id/portrait` | 5 |
| `apps/server/src/routes/places.ts` | add `GET /places/:id`, `POST /places/:id/image` | 6 |
| `apps/server/scripts/backfill-images.ts` | idempotent fail-soft backfill (`db:backfill:images`) | 7 |
| `apps/server/package.json`, `scripts/deploy.sh` | wire backfill | 7 |
| `apps/web/src/api/world.ts` | `getPlace`, `regeneratePortrait`, `regeneratePlaceImage` + types | 8 |
| `apps/web/src/screens/WhosWho/WhosWhoScreen.tsx` | portrait thumbnails + rows link to detail | 9 |
| `apps/web/src/screens/CharacterDetail/CharacterDetailScreen.tsx` | character detail | 10 |
| `apps/web/src/screens/PlaceDetail/PlaceDetailScreen.tsx` | place detail | 11 |
| `apps/web/src/screens/Town/TownScreen.tsx` + `townMap.ts` | Town + hotspot map | 12 |
| `apps/web/src/routes.tsx`, `screens/MainScreen/MainScreen.tsx` | routes + home link | 9,10,11,12 |

---

## Task 1: Shared DTOs for place detail

**Files:**
- Modify: `packages/shared/src/types/world.ts`
- Modify: `packages/shared/src/schemas/world.test.ts` (add a type-shape assertion is unnecessary; this task is pure types — gate is typecheck)

- [ ] **Step 1: Add the DTOs**

Append to `packages/shared/src/types/world.ts` (after the existing `CharacterDetail` interface):

```typescript
/** One case set in a place — spoiler-safe (title + the player's solved flag only; never a solution). */
export interface PlaceCase {
  mystery_id: string;
  title: string | null;
  solved: boolean;
}

export interface PlaceDetail {
  id: string;
  name: string;
  description: string;
  image_path: string | null;
  cases: PlaceCase[];
}
```

- [ ] **Step 2: Build + typecheck**

Run: `pnpm --filter @mysterio/shared build && pnpm --filter @mysterio/shared typecheck`
Expected: clean (pure additive types). `PlaceDetail`/`PlaceCase` are now exported via the existing `export * from "./types/world.js"` barrel.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/world.ts
git commit -m "3d: PlaceDetail/PlaceCase shared DTOs"
```

---

## Task 2: Character portrait generator (fail-soft)

**Files:**
- Create: `apps/server/src/services/images/portraitStyle.ts`
- Create: `apps/server/src/services/images/characterPortraitAgent.ts`
- Modify: `apps/server/src/services/images/storage.ts` (add `writePortraitImage`)
- Create: `apps/server/src/services/images/characterPortraitAgent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/images/characterPortraitAgent.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCharacterPortraitAgent } from "./characterPortraitAgent.js";
import * as imagesIndex from "./index.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("runCharacterPortraitAgent", () => {
  it("returns ok:false (never throws) when the provider fails", async () => {
    vi.spyOn(imagesIndex.defaultImageProvider, "generate").mockRejectedValue(new Error("provider boom"));
    const res = await runCharacterPortraitAgent({ characterId: "rosa-pine", description: "Diner owner." });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provider boom");
  });

  it("returns ok:true with a versioned characters/ path on success", async () => {
    vi.spyOn(imagesIndex.defaultImageProvider, "generate").mockResolvedValue(Buffer.from("png-bytes"));
    const res = await runCharacterPortraitAgent({ characterId: "rosa-pine", description: "Diner owner." });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.portraitImagePath).toMatch(/^characters\/rosa-pine-[a-z0-9]+\.png$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test characterPortraitAgent`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the storage helper**

In `apps/server/src/services/images/storage.ts`, add after `writeAvatarImage` (it uses the same `resolve`, `mkdir`, `writeFile`, `shortId` already imported/defined in that file):

```typescript
export async function writePortraitImage(characterId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  const dir = `${imageDir}/characters`;
  await mkdir(dir, { recursive: true });
  const fileName = `${characterId}-${shortId()}.png`;
  await writeFile(`${dir}/${fileName}`, buf);
  return `characters/${fileName}`;
}
```

- [ ] **Step 4: Add the style builder**

Create `apps/server/src/services/images/portraitStyle.ts` (mirrors `avatarStyle.ts`):

```typescript
export const PORTRAIT_STYLE_VERSION = "portrait-v1";

const STYLE_PREAMBLE =
  "A friendly storybook character portrait of a small-town resident, head-and-shoulders, in soft " +
  "golden-hour gouache, cozy and rounded, gentle painterly texture, on a simple warm background.";

// Same child-safety clause as cover/avatar generation — kept identical on purpose.
const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

/** Identity-only prompt. Must never reference a character's culprit status in any case (spoiler-safe). */
export function buildPortraitPrompt(description: string): string {
  return [
    STYLE_PREAMBLE,
    `The resident: ${description}`,
    "A single friendly character, centered, looking toward the viewer.",
    SAFETY_CLAUSE,
  ].join(" ");
}
```

- [ ] **Step 5: Add the agent**

Create `apps/server/src/services/images/characterPortraitAgent.ts` (mirrors `avatarImageAgent.ts`):

```typescript
import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { buildPortraitPrompt } from "./portraitStyle.js";
import { writePortraitImage } from "./storage.js";

const PORTRAIT_SIZE = "1024x1024";

export interface CharacterPortraitAgentInput {
  characterId: string;
  description: string;
}

export type CharacterPortraitAgentResult =
  | { ok: true; portraitImagePath: string }
  | { ok: false; error: string };

export async function runCharacterPortraitAgent(
  input: CharacterPortraitAgentInput,
): Promise<CharacterPortraitAgentResult> {
  const env = loadEnv();
  const prompt = buildPortraitPrompt(input.description);

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, { model: env.OPENAI_IMAGE_MODEL, size: PORTRAIT_SIZE });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("portrait_image_provider_failed", { character_id: input.characterId, error });
    return { ok: false, error };
  }

  try {
    const portraitImagePath = await writePortraitImage(input.characterId, buf);
    return { ok: true, portraitImagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("portrait_image_storage_failed", { character_id: input.characterId, error });
    return { ok: false, error };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test characterPortraitAgent && pnpm --filter @mysterio/server typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/images/portraitStyle.ts apps/server/src/services/images/characterPortraitAgent.ts apps/server/src/services/images/storage.ts apps/server/src/services/images/characterPortraitAgent.test.ts
git commit -m "3d: character portrait generator (gpt-image-1, fail-soft, versioned path)"
```

---

## Task 3: Place image generator (fail-soft)

**Files:**
- Create: `apps/server/src/services/images/placeStyle.ts`
- Create: `apps/server/src/services/images/placeImageAgent.ts`
- Modify: `apps/server/src/services/images/storage.ts` (add `writePlaceImage`)
- Create: `apps/server/src/services/images/placeImageAgent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/images/placeImageAgent.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPlaceImageAgent } from "./placeImageAgent.js";
import * as imagesIndex from "./index.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("runPlaceImageAgent", () => {
  it("returns ok:false (never throws) when the provider fails", async () => {
    vi.spyOn(imagesIndex.defaultImageProvider, "generate").mockRejectedValue(new Error("provider boom"));
    const res = await runPlaceImageAgent({ placeId: "maple-diner", name: "The Maple Diner", description: "A diner." });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provider boom");
  });

  it("returns ok:true with a versioned places/ path on success", async () => {
    vi.spyOn(imagesIndex.defaultImageProvider, "generate").mockResolvedValue(Buffer.from("png-bytes"));
    const res = await runPlaceImageAgent({ placeId: "maple-diner", name: "The Maple Diner", description: "A diner." });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.imagePath).toMatch(/^places\/maple-diner-[a-z0-9]+\.png$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test placeImageAgent`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the storage helper**

In `apps/server/src/services/images/storage.ts`, add after `writePortraitImage`:

```typescript
export async function writePlaceImage(placeId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  const dir = `${imageDir}/places`;
  await mkdir(dir, { recursive: true });
  const fileName = `${placeId}-${shortId()}.png`;
  await writeFile(`${dir}/${fileName}`, buf);
  return `places/${fileName}`;
}
```

- [ ] **Step 4: Add the style builder**

Create `apps/server/src/services/images/placeStyle.ts`:

```typescript
export const PLACE_STYLE_VERSION = "place-v1";

const STYLE_PREAMBLE =
  "A warm storybook illustration of a cozy small-town location, soft golden-hour gouache, " +
  "rounded and inviting, gentle painterly texture, no people in frame.";

const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

export function buildPlaceImagePrompt(name: string, description: string): string {
  return [
    STYLE_PREAMBLE,
    `The place: ${name}. ${description}`,
    "Show the building or setting and its mood, establishing-shot framing.",
    SAFETY_CLAUSE,
  ].join(" ");
}
```

- [ ] **Step 5: Add the agent**

Create `apps/server/src/services/images/placeImageAgent.ts`:

```typescript
import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { buildPlaceImagePrompt } from "./placeStyle.js";
import { writePlaceImage } from "./storage.js";

const PLACE_SIZE = "1024x1024";

export interface PlaceImageAgentInput {
  placeId: string;
  name: string;
  description: string;
}

export type PlaceImageAgentResult =
  | { ok: true; imagePath: string }
  | { ok: false; error: string };

export async function runPlaceImageAgent(input: PlaceImageAgentInput): Promise<PlaceImageAgentResult> {
  const env = loadEnv();
  const prompt = buildPlaceImagePrompt(input.name, input.description);

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, { model: env.OPENAI_IMAGE_MODEL, size: PLACE_SIZE });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("place_image_provider_failed", { place_id: input.placeId, error });
    return { ok: false, error };
  }

  try {
    const imagePath = await writePlaceImage(input.placeId, buf);
    return { ok: true, imagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("place_image_storage_failed", { place_id: input.placeId, error });
    return { ok: false, error };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test placeImageAgent && pnpm --filter @mysterio/server typecheck`
Expected: PASS; clean.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/images/placeStyle.ts apps/server/src/services/images/placeImageAgent.ts apps/server/src/services/images/storage.ts apps/server/src/services/images/placeImageAgent.test.ts
git commit -m "3d: place image generator (gpt-image-1, fail-soft, versioned path)"
```

---

## Task 4: Town-map generator + existence check (fail-soft)

**Files:**
- Create: `apps/server/src/services/images/townMapAgent.ts`
- Modify: `apps/server/src/services/images/storage.ts` (add `writeWorldImage`, `worldImageExists`)
- Create: `apps/server/src/services/images/townMapAgent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/images/townMapAgent.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { runTownMapAgent } from "./townMapAgent.js";
import * as imagesIndex from "./index.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("runTownMapAgent", () => {
  it("returns ok:false (never throws) when the provider fails", async () => {
    vi.spyOn(imagesIndex.defaultImageProvider, "generate").mockRejectedValue(new Error("provider boom"));
    const res = await runTownMapAgent();
    expect(res.ok).toBe(false);
  });

  it("returns ok:true with the fixed world/town-map.png path on success", async () => {
    vi.spyOn(imagesIndex.defaultImageProvider, "generate").mockResolvedValue(Buffer.from("png-bytes"));
    const res = await runTownMapAgent();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.imagePath).toBe("world/town-map.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test townMapAgent`
Expected: FAIL — module not found.

- [ ] **Step 3: Add storage helpers**

In `apps/server/src/services/images/storage.ts`, add (the file already imports `resolve`, `mkdir`, `writeFile`; add `access`/`constants` from `node:fs/promises` at the top if not present — verify the existing import line and extend it minimally):

```typescript
/** Writes a fixed-name image under world/ (overwrites — used for the single town map). Returns the key. */
export async function writeWorldImage(fileName: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  const dir = `${imageDir}/world`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${fileName}`, buf);
  return `world/${fileName}`;
}

/** True if the given world/ image already exists on disk (used to keep the map backfill idempotent). */
export async function worldImageExists(fileName: string): Promise<boolean> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  try {
    await access(`${imageDir}/world/${fileName}`);
    return true;
  } catch {
    return false;
  }
}
```

At the top of `storage.ts`, ensure `access` is imported: change the existing `import { mkdir, writeFile, unlink } from "node:fs/promises";` (or whatever the actual line is) to also include `access` — verify the real import line first and extend it.

- [ ] **Step 4: Add the town-map agent**

Create `apps/server/src/services/images/townMapAgent.ts`:

```typescript
import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { writeWorldImage, worldImageExists } from "./storage.js";

const MAP_FILE = "town-map.png";
const MAP_SIZE = "1024x1024";

const MAP_PROMPT =
  "A warm storybook bird's-eye illustrated map of a cozy small town called Maple Hollow, soft " +
  "golden-hour gouache, rounded and inviting, gentle painterly texture. Show a town square, little " +
  "shops, a library, a bakery, a diner, a schoolhouse, a pond, and tree-lined streets, arranged " +
  "across the whole frame. Child-friendly and age-appropriate for ages 8-13, non-violent, not scary. " +
  "No text, no words, no letters, no numbers, and no labels anywhere in the image.";

export type TownMapAgentResult = { ok: true; imagePath: string } | { ok: false; error: string };

/** True if the town map already exists on disk (backfill idempotency). */
export function townMapExists(): Promise<boolean> {
  return worldImageExists(MAP_FILE);
}

export async function runTownMapAgent(): Promise<TownMapAgentResult> {
  const env = loadEnv();
  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(MAP_PROMPT, { model: env.OPENAI_IMAGE_MODEL, size: MAP_SIZE });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("town_map_provider_failed", { error });
    return { ok: false, error };
  }
  try {
    const imagePath = await writeWorldImage(MAP_FILE, buf);
    return { ok: true, imagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("town_map_storage_failed", { error });
    return { ok: false, error };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test townMapAgent && pnpm --filter @mysterio/server typecheck`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/images/townMapAgent.ts apps/server/src/services/images/storage.ts apps/server/src/services/images/townMapAgent.test.ts
git commit -m "3d: town-map generator + world-image storage helpers (fail-soft, idempotent existence check)"
```

---

## Task 5: `POST /api/characters/:id/portrait` (regenerate)

**Files:**
- Modify: `apps/server/src/routes/characters.ts`
- Modify: `apps/server/src/routes/characters.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/server/src/routes/characters.test.ts` a new `describe` (the file's `beforeEach` already seeds `characters` incl. `rosa-pine`; you'll mock the portrait agent). Add this import at the top of the test file and the block:

```typescript
import { vi } from "vitest";
import * as portraitAgent from "../services/images/characterPortraitAgent.js";
```

```typescript
describe("POST /api/characters/:id/portrait", () => {
  it("regenerates a portrait, stores the path, and returns the character", async () => {
    vi.spyOn(portraitAgent, "runCharacterPortraitAgent").mockResolvedValue({ ok: true, portraitImagePath: "characters/rosa-pine-abc123.png" });
    const res = await app.inject({ method: "POST", url: "/api/characters/rosa-pine/portrait" });
    expect(res.statusCode).toBe(200);
    expect(res.json().character.portrait_image_path).toBe("characters/rosa-pine-abc123.png");
    vi.restoreAllMocks();
  });

  it("404s an unknown character", async () => {
    const res = await app.inject({ method: "POST", url: "/api/characters/nope/portrait" });
    expect(res.statusCode).toBe(404);
  });

  it("502s when generation fails (fail-soft, row unchanged)", async () => {
    vi.spyOn(portraitAgent, "runCharacterPortraitAgent").mockResolvedValue({ ok: false, error: "boom" });
    const res = await app.inject({ method: "POST", url: "/api/characters/rosa-pine/portrait" });
    expect(res.statusCode).toBe(502);
    vi.restoreAllMocks();
  });
});
```

> The test's existing `beforeEach` registers `charactersRoutes` and seeds `rosa-pine` with `description: "Diner owner."`. No description-missing case is needed (seed characters always have a description, which is `NOT NULL`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test routes/characters`
Expected: FAIL — POST route returns 404 for all (route not defined).

- [ ] **Step 3: Implement the route**

In `apps/server/src/routes/characters.ts`, add these imports to the existing blocks (merge into the top import lines):

```typescript
import { runCharacterPortraitAgent } from "../services/images/characterPortraitAgent.js";
import { deleteImageByKey } from "../services/images/storage.js";
```

Then add this handler inside `charactersRoutes`, after the existing `GET /characters/:id` handler (mirrors `POST /players/:id/avatar`):

```typescript
  // Regenerate a character's portrait — synchronous, fail-soft, best-effort cleanup of the prior file.
  app.post<{ Params: { id: string } }>("/characters/:id/portrait", async (req, reply) => {
    const db = getDb();
    const [character] = await db.select().from(characters).where(eq(characters.id, req.params.id)).limit(1);
    if (!character) { reply.status(404); return { error: "character_not_found" }; }

    const result = await runCharacterPortraitAgent({ characterId: character.id, description: character.description });
    if (!result.ok) { reply.status(502); return { error: "portrait_generation_failed", detail: result.error }; }

    const previousKey = character.portrait_image_path;
    await db.update(characters).set({ portrait_image_path: result.portraitImagePath }).where(eq(characters.id, character.id));
    if (previousKey && previousKey !== result.portraitImagePath) {
      await deleteImageByKey(previousKey);
    }
    const [row] = await db.select().from(characters).where(eq(characters.id, character.id)).limit(1);
    return { character: row };
  });
```

> `characters` is already imported in this file (from `../db/schema.js`); `eq` and `getDb` are already imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test routes/characters && pnpm --filter @mysterio/server typecheck`
Expected: PASS (incl. the existing spoiler-redaction tests untouched).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/characters.ts apps/server/src/routes/characters.test.ts
git commit -m "3d: POST /characters/:id/portrait — synchronous regenerate (mirrors avatar)"
```

---

## Task 6: `GET /api/places/:id` (detail + cases) + `POST /api/places/:id/image`

**Files:**
- Modify: `apps/server/src/routes/places.ts`
- Modify: `apps/server/src/routes/places.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `apps/server/src/routes/places.test.ts` `beforeEach` setup to also seed mysteries/solutions, and add the new cases. Full file:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { places, mysteries, solutions } from "../db/schema.js";
import { placesRoutes } from "./places.js";
import * as placeAgent from "../services/images/placeImageAgent.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  await db.insert(places).values({ id: "maple-diner", name: "The Maple Diner", description: "A diner.", is_seed: true });
  await db.insert(mysteries).values([
    { id: "m-solved", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Solved One", place_id: "maple-diner" },
    { id: "m-open", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Open One", place_id: "maple-diner" },
  ]);
  await db.insert(solutions).values({ id: "s1", mystery_id: "m-solved", player_id: "p1", is_correct: true } as never);
  app = Fastify();
  await app.register(placesRoutes, { prefix: "/api" });
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("GET /api/places", () => {
  it("lists places", async () => {
    const res = await app.inject({ method: "GET", url: "/api/places" });
    expect(res.statusCode).toBe(200);
    const list = res.json().places as Array<{ id: string; name: string }>;
    expect(list.find((p) => p.id === "maple-diner")?.name).toBe("The Maple Diner");
  });
});

describe("GET /api/places/:id", () => {
  it("returns place detail with its cases + the player's solved flag (spoiler-safe: no solution data)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/places/maple-diner?player_id=p1" });
    expect(res.statusCode).toBe(200);
    const place = res.json().place as { id: string; cases: Array<{ mystery_id: string; title: string; solved: boolean }> };
    expect(place.id).toBe("maple-diner");
    expect(place.cases).toHaveLength(2);
    expect(place.cases.find((c) => c.mystery_id === "m-solved")!.solved).toBe(true);
    expect(place.cases.find((c) => c.mystery_id === "m-open")!.solved).toBe(false);
    // No solution/culprit fields leak.
    expect(JSON.stringify(place)).not.toContain("is_culprit");
    expect(JSON.stringify(place)).not.toContain("who_did_it");
  });

  it("400s without player_id and 404s an unknown place", async () => {
    expect((await app.inject({ method: "GET", url: "/api/places/maple-diner" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/places/nope?player_id=p1" })).statusCode).toBe(404);
  });
});

describe("POST /api/places/:id/image", () => {
  it("regenerates a place image, stores it, returns the place", async () => {
    vi.spyOn(placeAgent, "runPlaceImageAgent").mockResolvedValue({ ok: true, imagePath: "places/maple-diner-abc.png" });
    const res = await app.inject({ method: "POST", url: "/api/places/maple-diner/image" });
    expect(res.statusCode).toBe(200);
    expect(res.json().place.image_path).toBe("places/maple-diner-abc.png");
    vi.restoreAllMocks();
  });

  it("502s when generation fails", async () => {
    vi.spyOn(placeAgent, "runPlaceImageAgent").mockResolvedValue({ ok: false, error: "boom" });
    const res = await app.inject({ method: "POST", url: "/api/places/maple-diner/image" });
    expect(res.statusCode).toBe(502);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mysterio/server test routes/places`
Expected: FAIL — `/places/:id` + the POST not defined.

- [ ] **Step 3: Implement the routes**

Replace `apps/server/src/routes/places.ts` with:

```typescript
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { PlaceDetail, PlaceCase } from "@mysterio/shared";
import { getDb } from "../db/client.js";
import { places, mysteries, solutions } from "../db/schema.js";
import { runPlaceImageAgent } from "../services/images/placeImageAgent.js";
import { deleteImageByKey } from "../services/images/storage.js";

const detailQuery = z.object({ player_id: z.string().min(1) });

export async function placesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/places", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: places.id, name: places.name, description: places.description, image_path: places.image_path })
      .from(places);
    return { places: rows };
  });

  // Place detail — cases set here, spoiler-safe (title + the player's solved flag only).
  app.get<{ Params: { id: string }; Querystring: { player_id?: string } }>("/places/:id", async (req, reply) => {
    const parsed = detailQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "player_id is required" });
    const playerId = parsed.data.player_id;
    const db = getDb();

    const [place] = await db
      .select({ id: places.id, name: places.name, description: places.description, image_path: places.image_path })
      .from(places)
      .where(eq(places.id, req.params.id));
    if (!place) return reply.code(404).send({ error: "place not found" });

    const rows = await db
      .select({
        mystery_id: mysteries.id,
        title: mysteries.title,
        solved: sql<boolean>`(${solutions.id} IS NOT NULL AND ${solutions.is_correct} = true)`,
      })
      .from(mysteries)
      .leftJoin(solutions, and(eq(solutions.mystery_id, mysteries.id), eq(solutions.player_id, playerId)))
      .where(eq(mysteries.place_id, req.params.id));

    const cases: PlaceCase[] = rows.map((r) => ({ mystery_id: r.mystery_id, title: r.title, solved: r.solved }));
    const detail: PlaceDetail = { id: place.id, name: place.name, description: place.description, image_path: place.image_path, cases };
    return { place: detail };
  });

  // Regenerate a place image — synchronous, fail-soft, best-effort cleanup of the prior file.
  app.post<{ Params: { id: string } }>("/places/:id/image", async (req, reply) => {
    const db = getDb();
    const [place] = await db.select().from(places).where(eq(places.id, req.params.id)).limit(1);
    if (!place) { reply.status(404); return { error: "place_not_found" }; }

    const result = await runPlaceImageAgent({ placeId: place.id, name: place.name, description: place.description });
    if (!result.ok) { reply.status(502); return { error: "place_image_generation_failed", detail: result.error }; }

    const previousKey = place.image_path;
    await db.update(places).set({ image_path: result.imagePath }).where(eq(places.id, place.id));
    if (previousKey && previousKey !== result.imagePath) {
      await deleteImageByKey(previousKey);
    }
    const [row] = await db.select().from(places).where(eq(places.id, place.id)).limit(1);
    return { place: row };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mysterio/server test routes/places && pnpm --filter @mysterio/server typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/places.ts apps/server/src/routes/places.test.ts
git commit -m "3d: GET /places/:id (cases, spoiler-safe) + POST /places/:id/image"
```

---

## Task 7: Idempotent, fail-soft image backfill + deploy wiring

**Files:**
- Create: `apps/server/scripts/backfill-images.ts`
- Create: `apps/server/scripts/backfill-images.test.ts`
- Modify: `apps/server/package.json` (add `db:backfill:images`)
- Modify: `scripts/deploy.sh`

- [ ] **Step 1: Write the failing test**

Create `apps/server/scripts/backfill-images.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../src/test/db.js";
import { getDb } from "../src/db/client.js";
import { characters, places } from "../src/db/schema.js";
import { backfillImages, type BackfillDeps } from "./backfill-images.js";

beforeEach(() => { setupTestDb(); });

function deps(overrides: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    generatePortrait: vi.fn(async (id: string) => ({ ok: true as const, portraitImagePath: `characters/${id}-x.png` })),
    generatePlaceImage: vi.fn(async (id: string) => ({ ok: true as const, imagePath: `places/${id}-x.png` })),
    townMapExists: vi.fn(async () => false),
    generateTownMap: vi.fn(async () => ({ ok: true as const, imagePath: "world/town-map.png" })),
    ...overrides,
  };
}

describe("backfillImages", () => {
  it("generates only for rows missing an image, and updates their path", async () => {
    const db = getDb();
    await db.insert(characters).values([
      { id: "c-missing", name: "A", description: "a", is_seed: true },
      { id: "c-has", name: "B", description: "b", is_seed: true, portrait_image_path: "characters/c-has-old.png" },
    ]);
    await db.insert(places).values([
      { id: "p-missing", name: "P", description: "p", is_seed: true },
      { id: "p-has", name: "Q", description: "q", is_seed: true, image_path: "places/p-has-old.png" },
    ]);
    const d = deps();
    const res = await backfillImages(db, d);

    expect(res.portraits).toBe(1);
    expect(res.places).toBe(1);
    expect(res.map).toBe(true);
    expect(d.generatePortrait).toHaveBeenCalledTimes(1);
    expect(d.generatePlaceImage).toHaveBeenCalledTimes(1);
    const cMissing = (await db.select().from(characters).where(eq(characters.id, "c-missing")))[0]!;
    expect(cMissing.portrait_image_path).toBe("characters/c-missing-x.png");
    const cHas = (await db.select().from(characters).where(eq(characters.id, "c-has")))[0]!;
    expect(cHas.portrait_image_path).toBe("characters/c-has-old.png"); // untouched
  });

  it("skips the map when it already exists, and is fail-soft per item", async () => {
    const db = getDb();
    await db.insert(characters).values({ id: "c1", name: "A", description: "a", is_seed: true });
    const d = deps({
      townMapExists: vi.fn(async () => true),
      generatePortrait: vi.fn(async () => ({ ok: false as const, error: "boom" })),
    });
    const res = await backfillImages(db, d);
    expect(res.map).toBe(false);
    expect(d.generateTownMap).not.toHaveBeenCalled();
    expect(res.portraits).toBe(0); // generation failed → not counted, did not throw
    const c1 = (await db.select().from(characters).where(eq(characters.id, "c1")))[0]!;
    expect(c1.portrait_image_path).toBeNull(); // unchanged on failure
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test backfill-images`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the backfill**

Create `apps/server/scripts/backfill-images.ts`:

```typescript
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { characters, places } from "../src/db/schema.js";
import { logger } from "../src/utils/logger.js";
import { runCharacterPortraitAgent } from "../src/services/images/characterPortraitAgent.js";
import { runPlaceImageAgent } from "../src/services/images/placeImageAgent.js";
import { runTownMapAgent, townMapExists } from "../src/services/images/townMapAgent.js";

type Db = ReturnType<typeof getDb>;

export interface BackfillDeps {
  generatePortrait: (id: string, description: string) => Promise<{ ok: true; portraitImagePath: string } | { ok: false; error: string }>;
  generatePlaceImage: (id: string, name: string, description: string) => Promise<{ ok: true; imagePath: string } | { ok: false; error: string }>;
  townMapExists: () => Promise<boolean>;
  generateTownMap: () => Promise<{ ok: true; imagePath: string } | { ok: false; error: string }>;
}

const defaultDeps: BackfillDeps = {
  generatePortrait: (id, description) => runCharacterPortraitAgent({ characterId: id, description }),
  generatePlaceImage: (id, name, description) => runPlaceImageAgent({ placeId: id, name, description }),
  townMapExists,
  generateTownMap: runTownMapAgent,
};

/**
 * Idempotent + fail-soft image backfill. Generates only for rows whose image path is null and the
 * map only if it's missing — so re-running on every deploy is a no-op once populated (cost guard).
 * Any single failure is logged and skipped; the function never throws on a generation error.
 */
export async function backfillImages(db: Db, deps: BackfillDeps = defaultDeps): Promise<{ portraits: number; places: number; map: boolean }> {
  let portraits = 0;
  let placeImgs = 0;
  let map = false;

  const charRows = await db.select().from(characters).where(isNull(characters.portrait_image_path));
  for (const c of charRows) {
    const res = await deps.generatePortrait(c.id, c.description);
    if (res.ok) {
      await db.update(characters).set({ portrait_image_path: res.portraitImagePath }).where(eq(characters.id, c.id));
      portraits++;
    } else {
      logger.info("backfill_portrait_failed", { character_id: c.id, error: res.error });
    }
  }

  const placeRows = await db.select().from(places).where(isNull(places.image_path));
  for (const p of placeRows) {
    const res = await deps.generatePlaceImage(p.id, p.name, p.description);
    if (res.ok) {
      await db.update(places).set({ image_path: res.imagePath }).where(eq(places.id, p.id));
      placeImgs++;
    } else {
      logger.info("backfill_place_image_failed", { place_id: p.id, error: res.error });
    }
  }

  if (!(await deps.townMapExists())) {
    const res = await deps.generateTownMap();
    if (res.ok) map = true;
    else logger.info("backfill_town_map_failed", { error: res.error });
  }

  return { portraits, places: placeImgs, map };
}

// CLI entrypoint (parallels scripts/seed-world.ts). Only runs when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillImages(getDb())
    .then((r) => {
      console.log(`backfilled ${r.portraits} portrait(s), ${r.places} place image(s), map=${r.map ? "generated" : "skipped"}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("image backfill failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test backfill-images && pnpm --filter @mysterio/server typecheck`
Expected: PASS.

- [ ] **Step 5: Add the package.json script**

In `apps/server/package.json` scripts, add after `db:seed:world`:

```json
    "db:backfill:images": "tsx --env-file=.env scripts/backfill-images.ts",
```

- [ ] **Step 6: Wire it into deploy**

In `scripts/deploy.sh`, add after the `db:seed:world` line:

```bash
  pnpm --filter @mysterio/server db:backfill:images || true
```

> Placed after seeding so the roster/places exist before image generation. `|| true` keeps a generation hiccup from failing the deploy (fail-soft). Idempotent: only fills nulls + a missing map, so re-deploys don't re-spend.

- [ ] **Step 7: Commit**

```bash
git add apps/server/scripts/backfill-images.ts apps/server/scripts/backfill-images.test.ts apps/server/package.json scripts/deploy.sh
git commit -m "3d: idempotent fail-soft image backfill (portraits + place images + town map) wired into deploy"
```

---

## Task 8: Web api client — place detail + regenerate calls

**Files:**
- Modify: `apps/web/src/api/world.ts`

- [ ] **Step 1: Extend the world api client**

Replace `apps/web/src/api/world.ts` with:

```typescript
import type { CharacterListItem, CharacterDetail, Place, PlaceDetail } from "@mysterio/shared";
import { api } from "./client.js";

export function listCharacters(): Promise<{ characters: CharacterListItem[] }> {
  return api("/api/characters");
}

export function getCharacter(id: string, playerId: string): Promise<{ character: CharacterDetail }> {
  return api(`/api/characters/${encodeURIComponent(id)}?player_id=${encodeURIComponent(playerId)}`);
}

export function regeneratePortrait(id: string): Promise<{ character: CharacterDetail }> {
  return api(`/api/characters/${encodeURIComponent(id)}/portrait`, { method: "POST" });
}

export function listPlaces(): Promise<{ places: Place[] }> {
  return api("/api/places");
}

export function getPlace(id: string, playerId: string): Promise<{ place: PlaceDetail }> {
  return api(`/api/places/${encodeURIComponent(id)}?player_id=${encodeURIComponent(playerId)}`);
}

export function regeneratePlaceImage(id: string): Promise<{ place: Place }> {
  return api(`/api/places/${encodeURIComponent(id)}/image`, { method: "POST" });
}
```

> `regeneratePortrait`/`regeneratePlaceImage` are exported as **intentional seams** (the regenerate endpoints exist per the spec's "regenerable" criterion; auto-on-deploy backfill is the primary path, so no UI button wires them in 3d). This mirrors how 3c exported `getCharacter`/`listPlaces` before 3d consumed them — do not flag them as dead code.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @mysterio/shared build && pnpm --filter @mysterio/web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/world.ts
git commit -m "3d: web world api — getPlace + portrait/place regenerate"
```

---

## Task 9: Upgrade Who's Who (portrait thumbnails + link to detail)

**Files:**
- Modify: `apps/web/src/screens/WhosWho/WhosWhoScreen.tsx`

- [ ] **Step 1: Upgrade the list rows**

Replace `apps/web/src/screens/WhosWho/WhosWhoScreen.tsx` with (keeps the existing Monogram + states; wraps each row in a `Link` to `/characters/:id` and renders the portrait thumbnail when present):

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCharacters } from "../../api/world.js";

/** Monogram fallback while a portrait doesn't exist yet. */
function Monogram({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center", background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--text-dim)" }}>
      {initials || "?"}
    </span>
  );
}

function Thumb({ name, portrait }: { name: string; portrait: string | null }) {
  if (!portrait) return <Monogram name={name} />;
  return <img src={`/images/${portrait}`} alt="" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px var(--line)" }} />;
}

export function WhosWhoScreen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["characters"],
    queryFn: () => listCharacters(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Who's Who in Maple Hollow</h1>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 14 }}>← Back</Link>
      </header>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading the townsfolk…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load the town just now.</p>}
      {data && data.characters.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No residents yet.</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {data?.characters.map((c) => (
          <li key={c.id}>
            <Link to={`/characters/${c.id}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: "var(--radius)", boxShadow: "0 2px 0 rgba(0,0,0,0.15)", color: "var(--text)", textDecoration: "none" }}>
              <Thumb name={c.name} portrait={c.portrait_image_path} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description}</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                {c.appearance_count} {c.appearance_count === 1 ? "case" : "cases"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: clean. (Route `/characters/:id` lands in Task 10; the link is inert until then — acceptable mid-build.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/WhosWho/WhosWhoScreen.tsx
git commit -m "3d: Who's Who — portrait thumbnails + rows link to character detail"
```

---

## Task 10: Character detail screen

**Files:**
- Create: `apps/web/src/screens/CharacterDetail/CharacterDetailScreen.tsx`
- Modify: `apps/web/src/routes.tsx`

- [ ] **Step 1: Build the screen**

Create `apps/web/src/screens/CharacterDetail/CharacterDetailScreen.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getCharacter } from "../../api/world.js";
import { usePlayerStore } from "../../state/playerStore.js";

function Monogram({ name, size }: { name: string; size: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span style={{ width: size, height: size, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", fontFamily: "var(--display)", fontWeight: 700, fontSize: size / 2.6, color: "var(--text-dim)" }}>
      {initials || "?"}
    </span>
  );
}

export function CharacterDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const characterId = id!;
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["character", characterId, playerId],
    queryFn: () => getCharacter(characterId, playerId),
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ marginBottom: 16 }}>
        <Link to="/whos-who" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Who's Who</Link>
      </header>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load this resident.</p>}

      {data && (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
            {data.character.portrait_image_path
              ? <img src={`/images/${data.character.portrait_image_path}`} alt="" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px var(--line)" }} />
              : <Monogram name={data.character.name} size={96} />}
            <h1 style={{ margin: 0, fontSize: 28 }}>{data.character.name}</h1>
          </div>

          <p style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>{data.character.description}</p>

          <h2 style={{ fontSize: 16, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 10 }}>Appears in these cases</h2>
          {data.character.appearances.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No cases yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {data.character.appearances.map((a) => (
                <li key={a.mystery_id}>
                  <Link to={`/mysteries/${a.mystery_id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: "var(--radius)", color: "var(--text)", textDecoration: "none", boxShadow: "0 2px 0 rgba(0,0,0,0.15)" }}>
                    <span style={{ fontFamily: "var(--display)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title ?? "Untitled case"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                      {a.role_in_case}{a.is_culprit ? " · culprit" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

> Spoiler-safety note: `a.is_culprit` is only present in the API payload when the player resolved that case (the 3c redaction). The `a.is_culprit ? " · culprit"` therefore reveals nothing for unresolved cases — the field is absent. Do not add `motive` display unless gating on the same presence.

- [ ] **Step 2: Register the route**

In `apps/web/src/routes.tsx`, add the import and route:

```tsx
import { CharacterDetailScreen } from "./screens/CharacterDetail/CharacterDetailScreen.js";
```
```tsx
      <Route path="/characters/:id" element={<CharacterDetailScreen />} />
```

> Place all new `<Route>` lines (this task's and Tasks 11–12's) BEFORE the existing catch-all `<Route path="*" element={<Navigate to="/" replace />} />` — routes after the wildcard never match.

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/screens/CharacterDetail/CharacterDetailScreen.tsx apps/web/src/routes.tsx
git commit -m "3d: character detail screen (portrait, bio, spoiler-safe appears-in-cases)"
```

---

## Task 11: Place detail screen

**Files:**
- Create: `apps/web/src/screens/PlaceDetail/PlaceDetailScreen.tsx`
- Modify: `apps/web/src/routes.tsx`

- [ ] **Step 1: Build the screen**

Create `apps/web/src/screens/PlaceDetail/PlaceDetailScreen.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { SceneFrame } from "../../components/casebook/index.js";
import { getPlace } from "../../api/world.js";
import { usePlayerStore } from "../../state/playerStore.js";

export function PlaceDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const placeId = id!;
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["place", placeId, playerId],
    queryFn: () => getPlace(placeId, playerId),
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ marginBottom: 16 }}>
        <Link to="/town" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Town</Link>
      </header>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load this place.</p>}

      {data && (
        <>
          <SceneFrame imageUrl={data.place.image_path ? `/images/${data.place.image_path}` : null} scene="town" height={200} kicker="Maple Hollow" style={{ marginBottom: 16 }} />
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>{data.place.name}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>{data.place.description}</p>

          <h2 style={{ fontSize: 16, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 10 }}>Cases set here</h2>
          {data.place.cases.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No cases here yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {data.place.cases.map((c) => (
                <li key={c.mystery_id}>
                  <Link to={`/mysteries/${c.mystery_id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: "var(--radius)", color: "var(--text)", textDecoration: "none", boxShadow: "0 2px 0 rgba(0,0,0,0.15)" }}>
                    <span style={{ fontFamily: "var(--display)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title ?? "Untitled case"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{c.solved ? "✓ solved" : "open"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

> `SceneFrame` (from the casebook primitives) already renders a `SceneArt` fallback when `imageUrl` is null — so a place without a generated image still looks intentional.

- [ ] **Step 2: Register the route**

In `apps/web/src/routes.tsx`, add:

```tsx
import { PlaceDetailScreen } from "./screens/PlaceDetail/PlaceDetailScreen.js";
```
```tsx
      <Route path="/places/:id" element={<PlaceDetailScreen />} />
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/screens/PlaceDetail/PlaceDetailScreen.tsx apps/web/src/routes.tsx
git commit -m "3d: place detail screen (image, cases-set-here, spoiler-safe)"
```

---

## Task 12: Town screen (place cards + hotspot map) + home link

**Files:**
- Create: `apps/web/src/screens/Town/townMap.ts`
- Create: `apps/web/src/screens/Town/TownScreen.tsx`
- Modify: `apps/web/src/routes.tsx`
- Modify: `apps/web/src/screens/MainScreen/MainScreen.tsx`

- [ ] **Step 1: Author the hotspot coordinates**

Create `apps/web/src/screens/Town/townMap.ts` (the 9 fixed seed place ids → percent positions on the map background; pins are labeled, so they need not align with drawn buildings):

```typescript
/** Authored hotspot positions (percent of the map box) for each seed place. */
export const TOWN_MAP_IMAGE = "/images/world/town-map.png";

export interface Hotspot { id: string; topPct: number; leftPct: number; }

export const TOWN_HOTSPOTS: Hotspot[] = [
  { id: "schoolhouse", topPct: 20, leftPct: 48 },
  { id: "clocktower-square", topPct: 45, leftPct: 48 },
  { id: "maple-diner", topPct: 30, leftPct: 25 },
  { id: "town-library", topPct: 28, leftPct: 70 },
  { id: "post-office", topPct: 40, leftPct: 14 },
  { id: "general-store", topPct: 60, leftPct: 30 },
  { id: "the-bakery", topPct: 62, leftPct: 64 },
  { id: "garage", topPct: 55, leftPct: 82 },
  { id: "millpond", topPct: 80, leftPct: 46 },
];
```

- [ ] **Step 2: Build the Town screen**

Create `apps/web/src/screens/Town/TownScreen.tsx` (map with hotspots + place cards; `listPlaces` provides names/images, the hotspot table provides positions):

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { SceneFrame } from "../../components/casebook/index.js";
import { listPlaces } from "../../api/world.js";
import { TOWN_MAP_IMAGE, TOWN_HOTSPOTS } from "./townMap.js";

export function TownScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["places"], queryFn: () => listPlaces(), staleTime: 5 * 60 * 1000 });
  const places = data?.places ?? [];
  const nameById = new Map(places.map((p) => [p.id, p.name]));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Maple Hollow</h1>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 14 }}>← Back</Link>
      </header>

      {/* Map with tappable hotspots. The map image falls back to a parchment box if not yet generated. */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "inset 0 0 0 1.5px var(--line)", background: "var(--surface-2)", marginBottom: 24 }}>
        <img src={TOWN_MAP_IMAGE} alt="Map of Maple Hollow" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {TOWN_HOTSPOTS.filter((h) => nameById.has(h.id)).map((h) => (
          <Link key={h.id} to={`/places/${h.id}`} title={nameById.get(h.id)} style={{ position: "absolute", top: `${h.topPct}%`, left: `${h.leftPct}%`, transform: "translate(-50%, -50%)", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: "var(--surface)", color: "var(--text)", textDecoration: "none", boxShadow: "0 1px 0 rgba(0,0,0,0.25), inset 0 0 0 1.5px var(--line)", whiteSpace: "nowrap" }}>
            📍 {nameById.get(h.id)}
          </Link>
        ))}
      </div>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading the town…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load the town just now.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {places.map((p) => (
          <Link key={p.id} to={`/places/${p.id}`} style={{ color: "var(--text)", textDecoration: "none" }}>
            <SceneFrame imageUrl={p.image_path ? `/images/${p.image_path}` : null} scene="town" height={120} tape={false} />
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, marginTop: 6 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

> The `onError` hides a missing map image so the parchment `--surface-2` box shows through with the pins still tappable — non-gating per the spec.

- [ ] **Step 3: Register the route + home link**

In `apps/web/src/routes.tsx`:
```tsx
import { TownScreen } from "./screens/Town/TownScreen.js";
```
```tsx
      <Route path="/town" element={<TownScreen />} />
```

In `apps/web/src/screens/MainScreen/MainScreen.tsx`, add a Town link in the header `<div>` next to the existing Who's Who + Settings links, matching the 38×38 icon-button style:
```tsx
        <Link to="/town" aria-label="Town" title="Maple Hollow town" style={{ width: 38, height: 38, borderRadius: 8, background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", display: "grid", placeItems: "center", textDecoration: "none", fontSize: 18 }}>
          🗺️
        </Link>
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/Town/ apps/web/src/routes.tsx apps/web/src/screens/MainScreen/MainScreen.tsx
git commit -m "3d: Town screen — hotspot map + place cards + home link"
```

---

## Final verification (after all tasks)

- [ ] **Whole-repo gates**

```bash
pnpm --filter @mysterio/shared build && pnpm --filter @mysterio/shared typecheck
pnpm --filter @mysterio/server test && pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build
```
Expected: all PASS.

- [ ] **Spoiler audit (manual)** — confirm no new read exposes unsolved culprit/motive: character detail shows `is_culprit` only when the appearance payload includes it (resolved cases); place detail exposes only `title` + `solved`. Grep the new web screens for `motive`/`who_did_it` — should be absent except the gated `is_culprit` chip.

- [ ] **Acceptance criteria** (from the spec):
  1. Portraits generate via gpt-image-1, store a path, render on Who's Who + detail, regenerable; failures fail-soft (monogram fallback). ✅ Tasks 2, 5, 9, 10
  2. Town, Who's Who, character detail, place detail render real 3c data, cross-link, spoiler-safe. ✅ Tasks 9–12, 6
  3. Town map renders with tappable hotspots → place detail. ✅ Tasks 4, 12
  4. Server suite + web typecheck/build green; deploy to exe.dev for the iPad pass. ✅ final gates + deploy

- [ ] **Deploy + backfill** — `scripts/deploy.sh` from `feat/world-surfaces-3d`. The deploy runs `db:backfill:images`, generating 14 portraits + 9 place images + 1 town map on prod (first run only — idempotent thereafter). This is real paid image spend; it happens automatically on deploy per the user's decision. Then hand to the user for the iPad pass.

## Notes & deferrals (do not implement in 3d)

- **Interactive map engine** (pan/zoom/pathfinding) → never for v1; the authored map + CSS hotspots is the design.
- **HQ folder-desk home** reorganization → 3e.
- **Editing roster identity from the UI** → out of scope; only portraits/place images are regenerable.
- **Open-ended generation / one-tap Start** → 3f (next after 3d).
- No generation-pipeline or solvability change — that was all 3c; this spec is purely the presentation + image layer.
