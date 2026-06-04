# Avatar Image Generation (Spec 2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a detective's `avatar_description` into a generated `gpt-image-1` portrait — mutable/regenerable — reusing the Spec 1b image pipeline; add `avatar_image_path`, a full-edit `PATCH /players/:id`, a synchronous `POST /players/:id/avatar`, and avatar rendering in the detective picker.

**Architecture:** Mirror **on-demand audio** (`POST /mysteries/:id/audio` synchronously runs the media agent and returns) for the explicit, kid-triggered avatar generation. Reuse the 1b `ImageProvider`/`OpenAiImageProvider`, the `/images/` static route, and the `vi.hoisted` mock pattern. Avatars are **mutable**: each generation writes a versioned `avatars/{playerId}-{token}.png` key, stores it in `avatar_image_path`, and deletes the prior file — so the existing immutable `/images/` cache stays correct (each regen is a new immutable URL).

**Tech Stack:** TypeScript, pnpm monorepo, Fastify, Drizzle + better-sqlite3 (SQLite), Vitest, React + Vite, OpenAI `gpt-image-1`. Spec: `docs/superpowers/specs/2026-06-04-detective-avatar-image-design.md`.

**Conventions:**
- Server tests: `pnpm --filter @mysterio/server test` (Vitest). Shared: `pnpm --filter @mysterio/shared test`.
- In-memory DB harness: `apps/server/src/test/db.ts` (`setupTestDb()` in `beforeEach`; migrates with `foreign_keys=OFF`).
- Routes are registered under `/api` (`apps/server/src/index.ts`), so a route defined as `/players/:id` is reached at `/api/players/:id`; the web client calls `/api/...`.
- Web has no test runner — gate is `pnpm --filter @mysterio/web typecheck` + `build`. Verify avatar UI in a real browser, not curl.
- ESM imports use `.js` extensions even for `.ts` sources. Commit messages prefix `M-2c:`.
- The image provider singleton is `defaultImageProvider` (`apps/server/src/services/images/index.ts`); agents call it directly and tests `vi.mock` it.

**Branch:** `feat/detective-avatar-image` (already created off `main`, with the design spec committed).

---

### Task 1: `avatar_image_path` column + `Player` type + migration 0005

Adds the nullable column (native `ADD COLUMN`, no rebuild — critical because `players` is the parent of FK-cascade children `clues`/`solutions`/`hints`), surfaces it on the shared `Player` type, and guards the migration shape.

**Files:**
- Modify: `apps/server/src/db/schema.ts` (the `players` table, lines ~4-14)
- Modify: `packages/shared/src/types/mystery.ts` (`Player` interface, lines ~18-25)
- Generate: `apps/server/src/db/migrations/0005_*.sql` + `meta/_journal.json` + `meta/0005_snapshot.json` (drizzle-kit)
- Test: `apps/server/src/db/migration_avatar_image_path.test.ts` (create)

- [ ] **Step 1: Add the column to the schema**

In `apps/server/src/db/schema.ts`, inside the `players` table, add after the `avatar_description: text("avatar_description"),` line:

```ts
  // No DB-level CHECK — players is the parent of FK-cascade children (clues/solutions/hints);
  // a CHECK would force a table rebuild (DROP TABLE players → cascade-wipe). Nullable ADD COLUMN only.
  avatar_image_path: text("avatar_image_path"),
```

- [ ] **Step 2: Add the field to the shared `Player` type**

In `packages/shared/src/types/mystery.ts`, add to the `Player` interface (after `avatar_description: string | null;`):

```ts
  avatar_image_path: string | null;
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @mysterio/server db:generate`
Expected: creates `apps/server/src/db/migrations/0005_<random>.sql` + updates `meta/_journal.json` + adds `meta/0005_snapshot.json`.

- [ ] **Step 4: Inspect the generated SQL (safety gate)**

Read the new `0005_*.sql`. It MUST be a single statement:

```sql
ALTER TABLE `players` ADD `avatar_image_path` text;
```

If it contains `CREATE TABLE \`__new_players\`` or `DROP TABLE` (a rebuild), STOP — re-check the schema edit added no CHECK and is nullable, delete the bad 0005 files, fix, regenerate. A rebuild would cascade-wipe clues/solutions/hints.

- [ ] **Step 5: Write the guard test**

Create `apps/server/src/db/migration_avatar_image_path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./migrations", import.meta.url));

describe("avatar_image_path migration", () => {
  it("adds the column via ALTER TABLE, not a players rebuild (preserves FK-cascade children)", () => {
    const sql = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`${DIR}/${f}`, "utf8"))
      .find((s) => s.includes("avatar_image_path"));
    expect(sql, "no migration adds avatar_image_path").toBeTruthy();
    expect(sql!).toContain("ALTER TABLE");
    expect(sql!).not.toContain("__new_players");
    expect(sql!).not.toContain("DROP TABLE `players`");
  });
});
```

- [ ] **Step 6: Run the guard test + build shared**

Run: `pnpm --filter @mysterio/server test -- migration_avatar_image_path`
Expected: PASS.

Run: `pnpm --filter @mysterio/shared build`
Expected: no errors (the new `Player` field must compile; `dist` is what server/web import).

- [ ] **Step 7: Run the full server suite**

Run: `pnpm --filter @mysterio/server test`
Expected: all PASS. `setupTestDb()` now applies 0005; the existing `players.test.ts` cascade test (inserts player + clues + solutions + hints, deletes the player, asserts children cascade) doubles as the populated-DB confirmation that 0005 keeps the schema + cascades intact. Existing inserts that omit `avatar_image_path` still work (nullable).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/db/schema.ts packages/shared/src/types/mystery.ts apps/server/src/db/migrations/0005_*.sql apps/server/src/db/migrations/meta/_journal.json apps/server/src/db/migrations/meta/0005_snapshot.json apps/server/src/db/migration_avatar_image_path.test.ts
git commit -m "M-2c: players.avatar_image_path column (migration 0005, native ADD COLUMN) + Player type"
```

---

### Task 2: Avatar image storage helpers

Mutable storage: write a versioned avatar key, and delete a prior key by path. Parallel to `writeCoverImage`.

**Files:**
- Modify: `apps/server/src/services/images/storage.ts`
- Test: `apps/server/src/services/images/avatarStorage.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/images/avatarStorage.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir = "";
vi.mock("../../config/env.js", () => ({ loadEnv: () => ({ IMAGE_DIR: dir }) }));

import { writeAvatarImage, deleteImageByKey } from "./storage.js";

describe("avatar storage", () => {
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "img-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("writes avatars/{playerId}-{token}.png and returns the key", async () => {
    const bytes = Buffer.from("png-bytes");
    const key = await writeAvatarImage("p-1", bytes);
    expect(key).toMatch(/^avatars\/p-1-[a-z0-9]+\.png$/);
    const written = await readFile(join(dir, key));
    expect(written.equals(bytes)).toBe(true);
  });

  it("deleteImageByKey removes a file and is a no-op on a missing file", async () => {
    const key = "avatars/p-1-abc.png";
    await writeFile(join(dir, "gone.png"), Buffer.from("x")).catch(() => {});
    // missing file: must not throw
    await expect(deleteImageByKey(key)).resolves.toBeUndefined();
    // existing file: gets removed
    const real = await writeAvatarImage("p-2", Buffer.from("y"));
    await deleteImageByKey(real);
    await expect(access(join(dir, real))).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mysterio/server test -- avatarStorage`
Expected: FAIL — `writeAvatarImage` / `deleteImageByKey` not exported.

- [ ] **Step 3: Implement the helpers**

In `apps/server/src/services/images/storage.ts`, add (keep the existing `writeCoverImage`):

```ts
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "../../config/env.js";
import { shortId } from "../../utils/ids.js";

// (existing writeCoverImage stays above)

/** Writes a versioned avatar PNG and returns its key (relative to IMAGE_DIR), e.g. "avatars/p1-ab12cd34.png". */
export async function writeAvatarImage(playerId: string, buf: Buffer): Promise<string> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  const dir = `${imageDir}/avatars`;
  await mkdir(dir, { recursive: true });
  const key = `avatars/${playerId}-${shortId()}.png`;
  await writeFile(`${imageDir}/${key}`, buf);
  return key;
}

/** Best-effort delete of an image by its IMAGE_DIR-relative key. No-op if the file is missing. */
export async function deleteImageByKey(key: string): Promise<void> {
  const env = loadEnv();
  const imageDir = resolve(env.IMAGE_DIR);
  try {
    await unlink(`${imageDir}/${key}`);
  } catch {
    // missing file / already gone — ignore
  }
}
```

Note: merge the new imports with the file's existing `import { mkdir, writeFile } from "node:fs/promises";` line — the final import must include `unlink`, and add the `resolve`, `loadEnv`, `shortId` imports if not already present (they are, except `unlink` and `shortId`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @mysterio/server test -- avatarStorage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/images/storage.ts apps/server/src/services/images/avatarStorage.test.ts
git commit -m "M-2c: avatar image storage — versioned writeAvatarImage + deleteImageByKey"
```

---

### Task 3: Avatar prompt builder

A character-portrait prompt that reuses the cover safety clause but a portrait style.

**Files:**
- Create: `apps/server/src/services/images/avatarStyle.ts`
- Test: `apps/server/src/services/images/avatarStyle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/images/avatarStyle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAvatarPrompt } from "./avatarStyle.js";

describe("buildAvatarPrompt", () => {
  it("weaves in the description and uses a portrait style", () => {
    const p = buildAvatarPrompt("a kid with curly red hair and a green coat");
    expect(p).toContain("a kid with curly red hair and a green coat");
    expect(p.toLowerCase()).toContain("portrait");
  });

  it("includes the child-safety clause (no text in image)", () => {
    const p = buildAvatarPrompt("anything");
    expect(p).toContain("Child-friendly and age-appropriate for ages 8-13");
    expect(p).toContain("No text, no words, no letters");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mysterio/server test -- avatarStyle`
Expected: FAIL — `buildAvatarPrompt` not exported.

- [ ] **Step 3: Implement the builder**

Create `apps/server/src/services/images/avatarStyle.ts`:

```ts
/** Bump when the avatar art style changes. */
export const AVATAR_STYLE_VERSION = "avatar-v1";

const STYLE_PREAMBLE =
  "A friendly storybook character portrait, head-and-shoulders, in soft golden-hour gouache, " +
  "cozy and rounded, gentle painterly texture, on a simple warm background.";

// Same child-safety clause as cover generation (style.ts) — kept identical on purpose.
const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

export function buildAvatarPrompt(description: string): string {
  return [
    STYLE_PREAMBLE,
    `The character: ${description}`,
    "A single friendly character, centered, looking toward the viewer.",
    SAFETY_CLAUSE,
  ].join(" ");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @mysterio/server test -- avatarStyle`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/images/avatarStyle.ts apps/server/src/services/images/avatarStyle.test.ts
git commit -m "M-2c: avatar prompt builder (portrait style + shared child-safety clause)"
```

---

### Task 4: Avatar image agent

Mirrors `coverImageAgent`: generate (square 1024×1024) → write → return a result object (non-throwing).

**Files:**
- Create: `apps/server/src/services/images/avatarImageAgent.ts`
- Test: `apps/server/src/services/images/avatarImageAgent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/images/avatarImageAgent.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, writeAvatarImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  writeAvatarImage: vi.fn(),
}));

vi.mock("./index.js", () => ({ defaultImageProvider: { generate } }));
vi.mock("./storage.js", () => ({ writeAvatarImage }));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1" }),
}));

import { runAvatarImageAgent } from "./avatarImageAgent.js";

const input = { playerId: "p-1", description: "a kid with red hair" };

describe("runAvatarImageAgent", () => {
  beforeEach(() => { generate.mockReset(); writeAvatarImage.mockReset(); });

  it("generates a square portrait and returns ok + path", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeAvatarImage.mockResolvedValue("avatars/p-1-abc.png");
    const res = await runAvatarImageAgent(input);
    expect(res).toEqual({ ok: true, avatarImagePath: "avatars/p-1-abc.png" });
    expect(generate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ size: "1024x1024" }));
  });

  it("returns ok:false (never throws) when the provider throws", async () => {
    generate.mockRejectedValue(new Error("rate_limited"));
    const res = await runAvatarImageAgent(input);
    expect(res.ok).toBe(false);
    expect(writeAvatarImage).not.toHaveBeenCalled();
  });

  it("returns ok:false (never throws) when storage throws", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeAvatarImage.mockRejectedValue(new Error("disk_full"));
    const res = await runAvatarImageAgent(input);
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mysterio/server test -- avatarImageAgent`
Expected: FAIL — `runAvatarImageAgent` not exported.

- [ ] **Step 3: Implement the agent**

Create `apps/server/src/services/images/avatarImageAgent.ts`:

```ts
import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { defaultImageProvider } from "./index.js";
import { writeAvatarImage } from "./storage.js";
import { buildAvatarPrompt } from "./avatarStyle.js";

/** Square portrait size for avatars (covers use the env landscape size). */
const AVATAR_SIZE = "1024x1024";

export interface AvatarImageAgentInput {
  playerId: string;
  description: string;
}

export type AvatarImageAgentResult =
  | { ok: true; avatarImagePath: string }
  | { ok: false; error: string };

export async function runAvatarImageAgent(
  input: AvatarImageAgentInput,
): Promise<AvatarImageAgentResult> {
  const env = loadEnv();
  const prompt = buildAvatarPrompt(input.description);

  let buf: Buffer;
  try {
    buf = await defaultImageProvider.generate(prompt, {
      model: env.OPENAI_IMAGE_MODEL,
      size: AVATAR_SIZE,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("avatar_image_provider_failed", { player_id: input.playerId, error });
    return { ok: false, error };
  }

  try {
    const avatarImagePath = await writeAvatarImage(input.playerId, buf);
    return { ok: true, avatarImagePath };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.info("avatar_image_storage_failed", { player_id: input.playerId, error });
    return { ok: false, error };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @mysterio/server test -- avatarImageAgent`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/images/avatarImageAgent.ts apps/server/src/services/images/avatarImageAgent.test.ts
git commit -m "M-2c: avatar image agent (square gpt-image-1, non-throwing result)"
```

---

### Task 5: `PATCH /players/:id` — full detective edit

Fast metadata update (no image gen). Edits any subset of name / age_range / default_difficulty / avatar_description.

**Files:**
- Modify: `apps/server/src/routes/players.ts`
- Test: `apps/server/src/routes/playersEdit.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routes/playersEdit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  getDb().insert(players).values({ id: "p1", name: "Lily", age_range: "10-11", default_difficulty: "easy", avatar_description: "red hair" }).run();
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("PATCH /players/:id", () => {
  it("updates a subset of fields and returns the player", async () => {
    const res = await app.inject({ method: "PATCH", url: "/players/p1", payload: { name: "Lily B", age_range: "12-13" } });
    expect(res.statusCode).toBe(200);
    const p = res.json().player;
    expect(p.name).toBe("Lily B");
    expect(p.age_range).toBe("12-13");
    expect(p.default_difficulty).toBe("easy"); // untouched
    expect(p.avatar_description).toBe("red hair"); // untouched
  });

  it("trims name and treats empty avatar_description as null", async () => {
    const res = await app.inject({ method: "PATCH", url: "/players/p1", payload: { name: "  Sam  ", avatar_description: "" } });
    expect(res.json().player.name).toBe("Sam");
    expect(res.json().player.avatar_description).toBeNull();
  });

  it("404s on unknown id and 400s on a bad field", async () => {
    expect((await app.inject({ method: "PATCH", url: "/players/nope", payload: { name: "X" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/players/p1", payload: { age_range: "99-100" } })).statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mysterio/server test -- playersEdit`
Expected: FAIL — no PATCH route (404 for all, or method-not-allowed).

- [ ] **Step 3: Implement the PATCH route**

In `apps/server/src/routes/players.ts`, add a `patchBody` schema next to `createBody`:

```ts
const patchBody = z.object({
  name: z.string().trim().min(1).max(24).optional(),
  age_range: z.enum(["8-9", "10-11", "12-13"]).optional(),
  default_difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  avatar_description: z.string().max(300).optional(),
});
```

Inside `playersRoutes`, add the handler (e.g. after the POST handler):

```ts
  app.patch<{ Params: { id: string } }>("/players/:id", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const existing = db.select().from(players).where(eq(players.id, req.params.id)).get();
    if (!existing) { reply.status(404); return { error: "player_not_found" }; }

    const patch: Partial<typeof players.$inferInsert> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.age_range !== undefined) patch.age_range = parsed.data.age_range;
    if (parsed.data.default_difficulty !== undefined) patch.default_difficulty = parsed.data.default_difficulty;
    if (parsed.data.avatar_description !== undefined) {
      patch.avatar_description = parsed.data.avatar_description.trim() ? parsed.data.avatar_description.trim() : null;
    }
    if (Object.keys(patch).length > 0) {
      db.update(players).set(patch).where(eq(players.id, req.params.id)).run();
    }
    const row = db.select().from(players).where(eq(players.id, req.params.id)).get();
    return { player: row };
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @mysterio/server test -- playersEdit`
Expected: PASS (3 tests).

- [ ] **Step 5: Run full server suite + typecheck**

Run: `pnpm --filter @mysterio/server test && pnpm --filter @mysterio/server typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/players.ts apps/server/src/routes/playersEdit.test.ts
git commit -m "M-2c: PATCH /players/:id — full detective edit (name/age/difficulty/description)"
```

---

### Task 6: `POST /players/:id/avatar` — synchronous (re)generate

Backs both "Generate" and "Regenerate". Mirrors on-demand audio: load player → generate from current description → store key → delete old file → return updated player. 400 on empty description.

**Files:**
- Modify: `apps/server/src/routes/players.ts`
- Test: `apps/server/src/routes/playersAvatar.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routes/playersAvatar.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

const { runAvatarImageAgent, deleteImageByKey } = vi.hoisted(() => ({
  runAvatarImageAgent: vi.fn(),
  deleteImageByKey: vi.fn(),
}));
vi.mock("../services/images/avatarImageAgent.js", () => ({ runAvatarImageAgent }));
vi.mock("../services/images/storage.js", () => ({ deleteImageByKey }));

import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  runAvatarImageAgent.mockReset();
  deleteImageByKey.mockReset();
  getDb().insert(players).values({ id: "p1", name: "Lily", age_range: "10-11", default_difficulty: "easy", avatar_description: "red hair" }).run();
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("POST /players/:id/avatar", () => {
  it("generates from the description, stores the key, returns the player", async () => {
    runAvatarImageAgent.mockResolvedValue({ ok: true, avatarImagePath: "avatars/p1-aaa.png" });
    const res = await app.inject({ method: "POST", url: "/players/p1/avatar" });
    expect(res.statusCode).toBe(200);
    expect(res.json().player.avatar_image_path).toBe("avatars/p1-aaa.png");
    expect(runAvatarImageAgent).toHaveBeenCalledWith({ playerId: "p1", description: "red hair" });
    const row = getDb().select().from(players).where(eq(players.id, "p1")).get();
    expect(row?.avatar_image_path).toBe("avatars/p1-aaa.png");
  });

  it("regenerating deletes the previous file", async () => {
    getDb().update(players).set({ avatar_image_path: "avatars/p1-old.png" }).where(eq(players.id, "p1")).run();
    runAvatarImageAgent.mockResolvedValue({ ok: true, avatarImagePath: "avatars/p1-new.png" });
    await app.inject({ method: "POST", url: "/players/p1/avatar" });
    expect(deleteImageByKey).toHaveBeenCalledWith("avatars/p1-old.png");
  });

  it("400s when the description is empty", async () => {
    getDb().update(players).set({ avatar_description: null }).where(eq(players.id, "p1")).run();
    const res = await app.inject({ method: "POST", url: "/players/p1/avatar" });
    expect(res.statusCode).toBe(400);
    expect(runAvatarImageAgent).not.toHaveBeenCalled();
  });

  it("404s on unknown id; 502s when the agent fails", async () => {
    expect((await app.inject({ method: "POST", url: "/players/nope/avatar" })).statusCode).toBe(404);
    runAvatarImageAgent.mockResolvedValue({ ok: false, error: "rate_limited" });
    expect((await app.inject({ method: "POST", url: "/players/p1/avatar" })).statusCode).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mysterio/server test -- playersAvatar`
Expected: FAIL — no avatar route.

- [ ] **Step 3: Implement the route**

In `apps/server/src/routes/players.ts`, add imports at the top:

```ts
import { runAvatarImageAgent } from "../services/images/avatarImageAgent.js";
import { deleteImageByKey } from "../services/images/storage.js";
```

Inside `playersRoutes`, add the handler:

```ts
  app.post<{ Params: { id: string } }>("/players/:id/avatar", async (req, reply) => {
    const db = getDb();
    const player = db.select().from(players).where(eq(players.id, req.params.id)).get();
    if (!player) { reply.status(404); return { error: "player_not_found" }; }
    const description = player.avatar_description?.trim();
    if (!description) { reply.status(400); return { error: "no_description" }; }

    const result = await runAvatarImageAgent({ playerId: player.id, description });
    if (!result.ok) { reply.status(502); return { error: "avatar_generation_failed", detail: result.error }; }

    const previousKey = player.avatar_image_path;
    db.update(players).set({ avatar_image_path: result.avatarImagePath }).where(eq(players.id, player.id)).run();
    if (previousKey && previousKey !== result.avatarImagePath) {
      await deleteImageByKey(previousKey); // best-effort cleanup of the prior version
    }
    const row = db.select().from(players).where(eq(players.id, player.id)).get();
    return { player: row };
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @mysterio/server test -- playersAvatar`
Expected: PASS (4 tests).

- [ ] **Step 5: Run full server suite + typecheck**

Run: `pnpm --filter @mysterio/server test && pnpm --filter @mysterio/server typecheck`
Expected: all PASS, no type errors. (The `players.test.ts` from 2a imports `playersRoutes`; the new route registers cleanly alongside it.)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/players.ts apps/server/src/routes/playersAvatar.test.ts
git commit -m "M-2c: POST /players/:id/avatar — synchronous (re)generate + prior-file cleanup"
```

---

### Task 7: Web API client — `updatePlayer` + `generateAvatar`

**Files:**
- Modify: `apps/web/src/api/players.ts`

- [ ] **Step 1: Add the two client functions**

In `apps/web/src/api/players.ts`, add (keep the existing `listPlayers`/`createPlayer`/`deletePlayer`):

```ts
export function updatePlayer(id: string, patch: {
  name?: string;
  age_range?: AgeRange;
  default_difficulty?: DifficultyId;
  avatar_description?: string;
}): Promise<{ player: Player }> {
  return api(`/api/players/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function generateAvatar(id: string): Promise<{ player: Player }> {
  return api(`/api/players/${id}/avatar`, { method: "POST" });
}
```

(`AgeRange`, `DifficultyId`, `Player` are already imported at the top of this file.)

- [ ] **Step 2: Typecheck the web app**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: clean.

Note: the `api()` client must not send a `Content-Type`/body on the bodyless `generateAvatar` POST — per `reference_web_delete_gotchas`, sending `Content-Type: application/json` with no body made Fastify return 400. Confirm `api()` already omits the header when no `body` is passed (it was fixed for `deletePlayer`); since `generateAvatar` passes no `body`, it follows the same bodyless path. Do not add a body.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/players.ts
git commit -m "M-2c: web api — updatePlayer (PATCH) + generateAvatar (POST)"
```

---

### Task 8: `EditDetective` screen — fields + avatar preview + Generate/Regenerate

A new screen with the same field set as `CreateDetective`, plus an avatar preview and a generate/regenerate button. Saving the form PATCHes the fields; if the description changed, it then auto-fires `generateAvatar`.

**Files:**
- Create: `apps/web/src/screens/EditDetective.tsx`

- [ ] **Step 1: Create the screen**

Create `apps/web/src/screens/EditDetective.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGE_RANGES, type AgeRange, type DifficultyId, type Player } from "@mysterio/shared";
import { updatePlayer, generateAvatar } from "../api/players.js";
import { Kicker } from "../components/casebook/index.js";

const DIFFICULTIES: DifficultyId[] = ["easy", "medium", "hard"];

export function EditDetective({ player, onDone }: { player: Player; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(player.name);
  const [ageRange, setAgeRange] = useState<AgeRange>(player.age_range);
  const [difficulty, setDifficulty] = useState<DifficultyId>(player.default_difficulty);
  const [avatar, setAvatar] = useState(player.avatar_description ?? "");
  const [imagePath, setImagePath] = useState<string | null>(player.avatar_image_path);

  const genM = useMutation({
    mutationFn: () => generateAvatar(player.id),
    onSuccess: (res) => {
      setImagePath(res.player.avatar_image_path);
      void qc.invalidateQueries({ queryKey: ["players"] });
    },
  });

  const saveM = useMutation({
    mutationFn: async () => {
      const descChanged = (avatar.trim() || "") !== (player.avatar_description ?? "");
      await updatePlayer(player.id, {
        name: name.trim(),
        age_range: ageRange,
        default_difficulty: difficulty,
        avatar_description: avatar.trim(),
      });
      if (descChanged && avatar.trim()) {
        await generateAvatar(player.id); // a changed description produces a fresh image
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["players"] }); onDone(); },
  });

  const valid = name.trim().length >= 1 && name.trim().length <= 24;
  const hasDescription = avatar.trim().length > 0;
  const busy = genM.isPending || saveM.isPending;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <Kicker>Edit detective</Kicker>

        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
          <div style={{
            width: 96, height: 96, borderRadius: 16, overflow: "hidden", display: "grid", placeItems: "center",
            background: "radial-gradient(120% 120% at 30% 25%, var(--accent), var(--accent-dark))",
            color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 40, border: "3px solid var(--cream)",
          }}>
            {imagePath
              ? <img src={`/images/${imagePath}`} alt={`${name}'s avatar`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (name[0] ?? "?").toUpperCase()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => genM.mutate()}
          disabled={!hasDescription || busy}
          style={{
            display: "block", margin: "0 auto 8px", padding: "8px 14px",
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
            cursor: hasDescription && !busy ? "pointer" : "not-allowed", opacity: hasDescription && !busy ? 1 : 0.6,
            fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          }}
        >
          {genM.isPending ? "Drawing…" : imagePath ? "↻ Regenerate" : "✨ Generate avatar"}
        </button>
        {!hasDescription && (
          <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12, margin: "0 0 8px" }}>
            Add a description below first.
          </p>
        )}

        <label style={{ display: "block", margin: "12px 0 4px" }}>Name</label>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: 12, boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "inherit", fontFamily: "inherit", fontSize: 16 }} />

        <label style={{ display: "block", margin: "16px 0 4px" }}>Age</label>
        <div style={{ display: "flex", gap: 8 }}>
          {AGE_RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setAgeRange(r)} aria-pressed={ageRange === r}
              style={{ flex: 1, padding: 12, fontWeight: ageRange === r ? 700 : 400, background: ageRange === r ? "var(--accent)" : "var(--surface)", color: ageRange === r ? "#fff" : "inherit", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer" }}>
              {r}
            </button>
          ))}
        </div>

        <label style={{ display: "block", margin: "16px 0 4px" }}>Difficulty</label>
        <div style={{ display: "flex", gap: 8 }}>
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}
              style={{ flex: 1, padding: 12, textTransform: "capitalize", fontWeight: difficulty === d ? 700 : 400, background: difficulty === d ? "var(--accent)" : "var(--surface)", color: difficulty === d ? "#fff" : "inherit", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer" }}>
              {d}
            </button>
          ))}
        </div>

        <label style={{ display: "block", margin: "16px 0 4px" }}>Describe your detective</label>
        <textarea value={avatar} maxLength={300} onChange={(e) => setAvatar(e.target.value)} rows={3}
          placeholder="e.g. a kid with curly red hair, a green coat, and a magnifying glass"
          style={{ width: "100%", padding: 12, boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "inherit", fontFamily: "inherit", fontSize: 15, resize: "vertical" }} />

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onDone} disabled={busy}
            style={{ flex: 1, padding: 14, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: busy ? "not-allowed" : "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={() => saveM.mutate()} disabled={!valid || busy}
            style={{ flex: 2, padding: 14, fontWeight: 700, background: "var(--accent)", color: "#fff", border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: valid && !busy ? "pointer" : "not-allowed", opacity: valid && !busy ? 1 : 0.6 }}>
            {saveM.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: clean + build succeeds. (This screen is not yet wired into the picker — that's Task 9 — but it must compile standalone.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/EditDetective.tsx
git commit -m "M-2c: EditDetective screen — full edit + avatar preview + generate/regenerate"
```

---

### Task 9: Wire avatar into `PlayerPicker` (render + open editor)

Render the avatar image when present, and open `EditDetective` from edit mode.

**Files:**
- Modify: `apps/web/src/screens/PlayerPicker.tsx`

- [ ] **Step 1: Render the avatar image + add an editor entry point**

In `apps/web/src/screens/PlayerPicker.tsx`:

(a) Add the imports:

```tsx
import type { Player } from "@mysterio/shared";
import { EditDetective } from "./EditDetective.js";
```

(b) Add an `editingPlayer` state alongside the existing `editing`/`creating` state:

```tsx
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
```

(c) Render the editor when one is selected (place this next to the existing `if (creating) return <CreateDetective ... />;`):

```tsx
  if (editingPlayer) return <EditDetective player={editingPlayer} onDone={() => setEditingPlayer(null)} />;
```

(d) Replace the gradient-initial avatar `<div>` (the one rendering `{(p.name[0] ?? "?").toUpperCase()}`) so it shows the image when present:

```tsx
                <div aria-hidden="true" style={{
                  width: 48, height: 48, borderRadius: 10, flex: "0 0 auto", display: "grid", placeItems: "center",
                  overflow: "hidden",
                  background: "radial-gradient(120% 120% at 30% 25%, var(--accent), var(--accent-dark))",
                  color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 22,
                  border: "3px solid var(--cream)",
                }}>
                  {p.avatar_image_path
                    ? <img src={`/images/${p.avatar_image_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (p.name[0] ?? "?").toUpperCase()}
                </div>
```

(e) In edit mode, the trash button stays; ALSO open the editor when the row's main button is tapped while editing. Change the row button's `onClick` from:

```tsx
                onClick={() => {
                  if (!editing) setActivePlayer(p.id);
                }}
```

to:

```tsx
                onClick={() => {
                  if (editing) setEditingPlayer(p);
                  else setActivePlayer(p.id);
                }}
```

(So in normal mode tapping a detective selects them; in edit mode tapping opens their editor, and the separate 🗑 button still deletes. The trash button must remain a SIBLING button — do NOT nest it inside the row button, per `reference_web_delete_gotchas`.)

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: clean + build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/screens/PlayerPicker.tsx
git commit -m "M-2c: PlayerPicker — render avatar image + open EditDetective from edit mode"
```

- [ ] **Step 4: Browser verification (manual, after deploy)**

Run the app (or use the deploy). Confirm: in edit mode, tapping a detective opens the editor; "Generate avatar" is disabled until a description exists; after generating, the portrait shows in the editor and on the picker card; "Regenerate" swaps in a different image; a detective with no avatar shows the gradient initial. (This is the visual half of the live smoke — coordinate with the user; image generation costs money.)

---

## Final verification (after all tasks)

- [ ] `pnpm --filter @mysterio/shared test && pnpm --filter @mysterio/shared build`
- [ ] `pnpm --filter @mysterio/server test`
- [ ] `pnpm --filter @mysterio/server typecheck`
- [ ] `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
- [ ] **Live image smoke (REAL MONEY — coordinate with the user):** generate one avatar end-to-end on the deploy; confirm the portrait renders, the synchronous ~30s `POST /players/:id/avatar` survives the exe.dev proxy timeout, regenerate yields a different image at a new URL (no stale cache), and the prior file is removed. If the proxy times out the synchronous call, escalate: the async-job + poll fallback (noted in the spec) becomes a follow-up.

## Notes for the implementer

- **Mutable-vs-immutable:** never key avatars by `{playerId}.png` alone — regeneration would reuse the URL and the `immutable` cache would serve a stale image. Always the versioned `avatars/{playerId}-{token}.png` key, stored in `avatar_image_path`, with the prior file deleted.
- **Square size:** avatars are `1024x1024`; covers use `env.OPENAI_IMAGE_SIZE` (`1536x1024`). The avatar agent passes the square size explicitly — do not read it from env.
- **Bodyless POST:** `generateAvatar` sends no body; do not add a `Content-Type` header (Fastify 400 per `reference_web_delete_gotchas`).
- **Out of scope:** no async job/status column, no rate-limiting, no avatar on mystery cards/narrative (spec §"Out of scope").
- **FK gotcha:** migration 0005 MUST be a native `ALTER` — `players` has cascade children; the guard test enforces no `__new_players`/`DROP TABLE players`.
