# Spec 3c — Recurring Cast & Places + Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Maple Hollow a persistent, shared cast and set of places; generation casts each new mystery from this roster, records which characters appeared in which case and in what per-case role, and sets the case in a known place — surfaced via read APIs and a minimal Who's Who list.

**Architecture:** Three new shared Postgres tables (`characters`, `places`, `case_appearances`) + a nullable `mysteries.place_id`, all global (no player scoping). `logic_structure_json` and its Zod schema stay **structurally unchanged**: the World tables are a **projection derived after the fact**. Two surgical generation changes — (1) a cast pool selected from the roster is injected into the Phase-1 logic prompt, and (2) a fail-soft extraction step at the `ready` transition upserts any new resident and writes the per-case appearance rows. Read APIs redact `is_culprit`/`motive` for cases the requesting player hasn't resolved.

**Tech Stack:** Fastify + drizzle-orm (node-postgres) + Postgres 16, Zod DTOs in `packages/shared`, React + Vite + TanStack Query in `apps/web` (inline styles, casebook CSS tokens), vitest + pg-mem for server tests.

---

## Critical constraints (read before starting)

- **Spec source of truth:** `docs/superpowers/specs/2026-06-08-3c-recurring-cast-places-design.md`. Re-read its "Decisions (locked)", "Architecture", and "Acceptance criteria" sections.
- **NAME COLLISION — do not reuse `Character`.** `packages/shared` already exports `Character` (the per-case character embedded in `logic_structure_json`, at `packages/shared/src/types/logicStructure.ts:14`). The new persistent identity DTO is named **`RosterCharacter`**. Never name the new type `Character`.
- **`logic_structure_json` and `logicStructureSchema` are FROZEN in 3c.** Do not add fields, do not normalize characters out of the JSON. The solvability machinery (validation / prose-solver / continuity-audit / narrative / distractors) must keep operating on the JSON untouched.
- **Additive migration only.** `CREATE TABLE` + `ADD COLUMN` only — never rebuild an existing table (FK-cascade safety on prod). PG `ADD COLUMN` is safe.
- **Fail-soft everywhere in generation.** Roster selection returning empty, place-match miss, over-invention of residents, and the entire extraction step must **never fail an otherwise-good mystery**. The World linkage is enhancement, not correctness.
- **Spoiler rule.** `case_appearances.is_culprit`/`motive` for an unsolved case must NEVER be exposed. "Resolved" = a `solutions` row exists for `(player_id, mystery_id)` with `is_correct = true` OR `gave_up = true`.
- **3c KEEPS the fixed `category` + `difficulty` generate inputs.** The open-ended generation rewrite is 3f — do not touch the category menu here.
- **ESM import specifiers use `.js`** (e.g. `import { getDb } from "../db/client.js"`), even for `.ts` sources. Match existing files.
- **Commands** (run from repo root): server tests `pnpm --filter @mysterio/server test`; server typecheck `pnpm --filter @mysterio/server typecheck`; shared tests `pnpm --filter @mysterio/shared test`; web typecheck `pnpm --filter @mysterio/web typecheck`; web build `pnpm --filter @mysterio/web build`.

## File structure (what each task creates/touches)

| File | Responsibility | Task |
|---|---|---|
| `packages/shared/src/schemas/world.ts` | Zod schemas for persistent roster entities | 1 |
| `packages/shared/src/types/world.ts` | Wire DTO types (`RosterCharacter`, `Place`, `CaseAppearance`, `CharacterListItem`, `CharacterDetail`, `CharacterAppearance`) | 1 |
| `packages/shared/src/index.ts` | Barrel exports | 1 |
| `apps/server/src/db/schema.ts` | 3 new pgTables + `mysteries.place_id` | 2 |
| `apps/server/src/db/migrations/0001_*.sql` | Generated additive migration | 2 |
| `apps/server/src/db/seed/mapleHollow.ts` | Curated roster seed data | 3 |
| `apps/server/scripts/seed-world.ts` | Empty-guarded idempotent seeder | 3 |
| `apps/server/package.json` | `db:seed:world` script | 3 |
| `apps/server/src/services/generation/roster.ts` | `selectCastPool` + `extractAppearances` | 4, 5 |
| `apps/server/src/services/generation/prompts/logicStructure.system.ts` | static "CAST FROM ROSTER" rules | 6 |
| `apps/server/src/services/generation/agents/logicStructureAgent.ts` | thread `castPool` into the user message | 6 |
| `apps/server/src/services/generation/orchestrator.ts` | call `selectCastPool` + `extractAppearances` | 7 |
| `apps/server/src/routes/characters.ts` | `GET /characters`, `GET /characters/:id` (spoiler-safe) | 8 |
| `apps/server/src/routes/places.ts` | `GET /places` | 8 |
| `apps/server/src/index.ts` | register the two route plugins | 8 |
| `apps/web/src/api/world.ts` | api client calls | 9 |
| `apps/web/src/screens/WhosWho/WhosWhoScreen.tsx` | minimal Who's Who list | 9 |
| `apps/web/src/routes.tsx` | `/whos-who` route | 9 |
| `apps/web/src/screens/MainScreen/MainScreen.tsx` | home-screen link | 9 |

---

## Task 1: Shared DTOs (`RosterCharacter`, `Place`, `CaseAppearance`, API shapes)

**Files:**
- Create: `packages/shared/src/schemas/world.ts`
- Create: `packages/shared/src/types/world.ts`
- Create: `packages/shared/src/schemas/world.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/schemas/world.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { rosterCharacterSchema, placeSchema, caseAppearanceSchema } from "./world.js";

describe("world schemas", () => {
  it("parses a valid roster character", () => {
    const c = rosterCharacterSchema.parse({
      id: "old-man-hawthorne",
      name: "Old Man Hawthorne",
      description: "The town clockmaker, gruff but fair.",
      traits: "precise, suspicious of strangers",
      portrait_image_path: null,
      is_seed: true,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(c.id).toBe("old-man-hawthorne");
    expect(c.traits).toBe("precise, suspicious of strangers");
  });

  it("allows null traits and portrait", () => {
    const c = rosterCharacterSchema.parse({
      id: "newcomer",
      name: "Newcomer",
      description: "A brand-new face in town.",
      traits: null,
      portrait_image_path: null,
      is_seed: false,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(c.traits).toBeNull();
  });

  it("parses a place and an appearance", () => {
    const p = placeSchema.parse({
      id: "maple-diner",
      name: "The Maple Diner",
      description: "A cozy diner on Main Street.",
      image_path: null,
      is_seed: true,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(p.id).toBe("maple-diner");
    const a = caseAppearanceSchema.parse({
      id: "m1_old-man-hawthorne",
      mystery_id: "m1",
      character_id: "old-man-hawthorne",
      role_in_case: "suspect",
      is_culprit: false,
      motive: null,
      created_at: "2026-06-21T00:00:00.000Z",
    });
    expect(a.role_in_case).toBe("suspect");
  });

  it("rejects an invalid role_in_case", () => {
    expect(() =>
      caseAppearanceSchema.parse({
        id: "x", mystery_id: "m1", character_id: "c1",
        role_in_case: "detective", is_culprit: false, motive: null,
        created_at: "2026-06-21T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/shared test`
Expected: FAIL — cannot find module `./world.js`.

- [ ] **Step 3: Create the schemas**

Create `packages/shared/src/schemas/world.ts`:

```typescript
import { z } from "zod";

/** role this character played in ONE case. NOT "detective" — that's the player. */
export const roleInCaseSchema = z.enum(["suspect", "witness", "bystander"]);

/** Persistent identity row — never carries per-case guilt. created_at is an ISO string on the wire. */
export const rosterCharacterSchema = z.object({
  id: z.string().min(1).max(48),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(600),
  traits: z.string().max(400).nullable(),
  portrait_image_path: z.string().nullable(),
  is_seed: z.boolean(),
  created_at: z.string(),
});

export const placeSchema = z.object({
  id: z.string().min(1).max(48),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(600),
  image_path: z.string().nullable(),
  is_seed: z.boolean(),
  created_at: z.string(),
});

export const caseAppearanceSchema = z.object({
  id: z.string().min(1),
  mystery_id: z.string().min(1),
  character_id: z.string().min(1),
  role_in_case: roleInCaseSchema,
  is_culprit: z.boolean(),
  motive: z.string().nullable(),
  created_at: z.string(),
});
```

- [ ] **Step 4: Create the wire DTO types**

Create `packages/shared/src/types/world.ts`:

```typescript
import type { z } from "zod";
import type { rosterCharacterSchema, placeSchema, caseAppearanceSchema, roleInCaseSchema } from "../schemas/world.js";

export type RoleInCase = z.infer<typeof roleInCaseSchema>;
export type RosterCharacter = z.infer<typeof rosterCharacterSchema>;
export type Place = z.infer<typeof placeSchema>;
export type CaseAppearance = z.infer<typeof caseAppearanceSchema>;

/** GET /api/characters item — spoiler-safe (count only, no per-case guilt). */
export interface CharacterListItem {
  id: string;
  name: string;
  description: string;
  portrait_image_path: string | null;
  appearance_count: number;
}

/** One appearance in GET /api/characters/:id. is_culprit/motive are OMITTED unless the player resolved that case. */
export interface CharacterAppearance {
  mystery_id: string;
  title: string | null;
  role_in_case: RoleInCase;
  is_culprit?: boolean;
  motive?: string | null;
}

export interface CharacterDetail {
  id: string;
  name: string;
  description: string;
  portrait_image_path: string | null;
  appearances: CharacterAppearance[];
}
```

- [ ] **Step 5: Add barrel exports**

In `packages/shared/src/index.ts`, append after the existing exports:

```typescript
export * from "./schemas/world.js";
export * from "./types/world.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @mysterio/shared test` then `pnpm --filter @mysterio/shared typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/world.ts packages/shared/src/types/world.ts packages/shared/src/schemas/world.test.ts packages/shared/src/index.ts
git commit -m "3c: shared World DTOs (RosterCharacter/Place/CaseAppearance + API shapes)"
```

---

## Task 2: DB schema + additive migration

**Files:**
- Modify: `apps/server/src/db/schema.ts` (add 3 tables + `mysteries.place_id`)
- Create (generated): `apps/server/src/db/migrations/0001_*.sql`
- Create: `apps/server/src/db/schema.world.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/db/schema.world.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../test/db.js";
import { getDb } from "./client.js";
import { characters, places, caseAppearances, mysteries } from "./schema.js";

beforeEach(() => { setupTestDb(); });
afterEach(() => {});

describe("world schema migration", () => {
  it("creates characters/places/case_appearances and mysteries.place_id", async () => {
    const db = getDb();
    await db.insert(places).values({ id: "maple-diner", name: "Diner", description: "A diner.", is_seed: true });
    await db.insert(characters).values({ id: "c1", name: "Cass", description: "A resident.", is_seed: true });
    // mysteries.place_id column exists and accepts a value
    await db.insert(mysteries).values({
      id: "m1", category: "missing-pet", difficulty: "easy", status: "ready", place_id: "maple-diner",
    });
    await db.insert(caseAppearances).values({
      id: "m1_c1", mystery_id: "m1", character_id: "c1", role_in_case: "suspect", is_culprit: false, motive: null,
    });
    const rows = await db.select().from(caseAppearances);
    expect(rows).toHaveLength(1);
    expect(rows[0].role_in_case).toBe("suspect");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test schema.world`
Expected: FAIL — `characters`/`places`/`caseAppearances` are not exported from `schema.js`.

- [ ] **Step 3: Add the tables to schema.ts**

In `apps/server/src/db/schema.ts`, add to the `mysteries` column list (after `cover_image_path`):

```typescript
  place_id: text("place_id").references(() => places.id, { onDelete: "set null" }),
```

Then append three new tables at the end of the file (after `hints`):

```typescript
export const characters = pgTable("characters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  traits: text("traits"),
  portrait_image_path: text("portrait_image_path"),
  is_seed: boolean("is_seed").notNull().default(false),
  created_at: createdAt(),
});

export const places = pgTable("places", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  image_path: text("image_path"),
  is_seed: boolean("is_seed").notNull().default(false),
  created_at: createdAt(),
});

export const caseAppearances = pgTable("case_appearances", {
  id: text("id").primaryKey(),
  mystery_id: text("mystery_id").notNull().references(() => mysteries.id, { onDelete: "cascade" }),
  character_id: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  role_in_case: text("role_in_case").notNull(),
  is_culprit: boolean("is_culprit").notNull().default(false),
  motive: text("motive"),
  created_at: createdAt(),
}, (t) => ({
  roleCheck: check("case_appearances_role_chk", sql`${t.role_in_case} IN ('suspect','witness','bystander')`),
  mysteryCharUniq: uniqueIndex("case_appearances_mystery_char_uniq").on(t.mystery_id, t.character_id),
  characterIdx: index("idx_case_appearances_character").on(t.character_id),
  mysteryIdx: index("idx_case_appearances_mystery").on(t.mystery_id),
}));
```

> `places` is referenced by `mysteries.place_id` but declared lower in the file — drizzle's `() => places.id` thunk handles the forward reference; no reordering needed. `check`, `index`, `uniqueIndex`, `boolean`, `text` are already imported at the top of `schema.ts`.

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @mysterio/server db:generate`
Expected: a new file `apps/server/src/db/migrations/0001_<random-name>.sql` is created containing `CREATE TABLE "characters"`, `CREATE TABLE "places"`, `CREATE TABLE "case_appearances"`, and `ALTER TABLE "mysteries" ADD COLUMN "place_id"`. Inspect it to confirm it is **additive only** (no `DROP`, no table rebuild). Confirm `apps/server/src/db/migrations/meta/_journal.json` was updated.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test schema.world`
Expected: PASS — the pg-mem harness (`src/test/db.ts` `setupTestDb`) applies all `.sql` migrations including the new one, skipping FK constraints automatically.

- [ ] **Step 6: Verify the full server suite still passes (no regressions)**

Run: `pnpm --filter @mysterio/server test`
Expected: PASS — all existing tests green (the new column/tables are additive).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/src/db/migrations/ apps/server/src/db/schema.world.test.ts
git commit -m "3c: characters/places/case_appearances tables + mysteries.place_id (additive migration)"
```

---

## Task 3: Curated Maple Hollow seed + empty-guarded seeder

**Files:**
- Create: `apps/server/src/db/seed/mapleHollow.ts`
- Create: `apps/server/scripts/seed-world.ts`
- Create: `apps/server/scripts/seed-world.test.ts`
- Modify: `apps/server/package.json` (add `db:seed:world` script)

- [ ] **Step 1: Author the seed data**

Create `apps/server/src/db/seed/mapleHollow.ts`:

```typescript
/** Curated Maple Hollow roster — the canonical shared cast/places for generation (3c). */
export interface SeedCharacter {
  id: string;
  name: string;
  description: string;
  traits: string;
}
export interface SeedPlace {
  id: string;
  name: string;
  description: string;
}

export const SEED_CHARACTERS: SeedCharacter[] = [
  { id: "mayor-ada-finch", name: "Mayor Ada Finch", description: "Maple Hollow's brisk, big-hearted mayor who knows every family by name.", traits: "organized, proud of the town, talks fast" },
  { id: "clockmaker-bram-hale", name: "Bram Hale", description: "The town clockmaker, gruff but fair, with ink-stained fingers and a pocketful of tiny gears.", traits: "precise, suspicious of strangers, never late" },
  { id: "diner-owner-rosa-pine", name: "Rosa Pine", description: "Owner of the Maple Diner; she remembers everyone's usual order and overhears half the town's secrets.", traits: "warm, gossipy, sharp memory" },
  { id: "librarian-jun-okafor", name: "Jun Okafor", description: "The quiet librarian who shelves books by feel and keeps a list of every overdue title.", traits: "observant, soft-spoken, tidy" },
  { id: "paperboy-milo-dart", name: "Milo Dart", description: "The fastest paperboy in town, on his bike before sunrise, knows which porch lights come on when.", traits: "restless, early riser, knows every shortcut" },
  { id: "baker-greta-stone", name: "Greta Stone", description: "The baker whose cinnamon buns draw a line out the door; flour dusts everything she touches.", traits: "generous, stubborn, up before dawn" },
  { id: "vet-dr-omar-reed", name: "Dr. Omar Reed", description: "The town vet who treats everything from hamsters to horses and keeps treats in every pocket.", traits: "gentle, scattered, loves animals" },
  { id: "gardener-pip-vale", name: "Pip Vale", description: "The community gardener who tends the square's flowerbeds and always has dirt under their nails.", traits: "patient, knows every plant, hums while working" },
  { id: "shopkeeper-nadia-frost", name: "Nadia Frost", description: "Runs the general store; she can find anything in the back and forgets nothing she's sold.", traits: "thrifty, exact, no-nonsense" },
  { id: "fisher-cole-marsh", name: "Cole Marsh", description: "Spends dawn at the pond with a rod and a thermos; sees who comes and goes by the water.", traits: "quiet, weatherwise, keeps to himself" },
  { id: "teacher-iris-bell", name: "Iris Bell", description: "The beloved schoolteacher who plans every field trip down to the minute.", traits: "encouraging, meticulous, fair" },
  { id: "mechanic-sal-rivera", name: "Sal Rivera", description: "The garage mechanic with grease on her sleeves who can name a car by its engine cough.", traits: "practical, blunt, good with her hands" },
  { id: "musician-theo-lark", name: "Theo Lark", description: "Plays fiddle on the square steps and knows the words to every old town song.", traits: "dreamy, friendly, forgetful" },
  { id: "postmaster-edith-crane", name: "Edith Crane", description: "The postmaster who sorts every letter and notices when a stamp looks wrong.", traits: "curious, by-the-book, eagle-eyed" },
];

export const SEED_PLACES: SeedPlace[] = [
  { id: "maple-diner", name: "The Maple Diner", description: "A cozy chrome-and-vinyl diner on Main Street where the whole town turns up for pie." },
  { id: "town-library", name: "Maple Hollow Library", description: "A small stone library with creaky stacks and a reading nook by the window." },
  { id: "clocktower-square", name: "Clocktower Square", description: "The cobbled town square beneath the old clock tower, ringed with flowerbeds and benches." },
  { id: "general-store", name: "Frost's General Store", description: "A crowded shop that sells a little of everything, from fishing line to birthday candles." },
  { id: "the-bakery", name: "Stone's Bakery", description: "A warm corner bakery whose front window fogs with the smell of cinnamon." },
  { id: "millpond", name: "The Millpond", description: "A still pond at the edge of town with a leaning dock and an old water wheel." },
  { id: "schoolhouse", name: "Maple Hollow Schoolhouse", description: "A red-brick schoolhouse with a bell, a wide yard, and a vegetable garden out back." },
  { id: "garage", name: "Rivera's Garage", description: "A busy repair garage smelling of oil and rubber, tools hung in neat rows." },
  { id: "post-office", name: "The Post Office", description: "A tidy little post office with brass mailboxes and a counter worn smooth by elbows." },
];
```

- [ ] **Step 2: Write the failing seeder test**

Create `apps/server/scripts/seed-world.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../src/test/db.js";
import { getDb } from "../src/db/client.js";
import { characters, places } from "../src/db/schema.js";
import { seedWorld } from "./seed-world.js";

beforeEach(() => { setupTestDb(); });
afterEach(() => {});

describe("seedWorld", () => {
  it("populates the roster on an empty DB", async () => {
    const res = await seedWorld();
    expect(res.seeded).toBe(true);
    const chars = await getDb().select().from(characters);
    const plcs = await getDb().select().from(places);
    expect(chars.length).toBeGreaterThanOrEqual(12);
    expect(plcs.length).toBeGreaterThanOrEqual(8);
    expect(chars.every((c) => c.is_seed)).toBe(true);
  });

  it("is a no-op when the roster is already non-empty (empty-DB guard)", async () => {
    await getDb().insert(characters).values({ id: "preexisting", name: "X", description: "x", is_seed: false });
    const res = await seedWorld();
    expect(res.seeded).toBe(false);
    const chars = await getDb().select().from(characters);
    expect(chars).toHaveLength(1); // unchanged
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test seed-world`
Expected: FAIL — cannot find module `./seed-world.js`.

- [ ] **Step 4: Write the seeder**

Create `apps/server/scripts/seed-world.ts` (mirrors the `scripts/seed-players.ts` empty-DB guard + `onConflictDoNothing` idempotency):

```typescript
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { characters, places } from "../src/db/schema.js";
import { SEED_CHARACTERS, SEED_PLACES } from "../src/db/seed/mapleHollow.js";

/** Idempotent, empty-roster-guarded world seeder. Safe to run on every deploy. */
export async function seedWorld(): Promise<{ seeded: boolean; characters: number; places: number }> {
  const db = getDb();
  const res = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM characters`);
  const n = Number((res.rows[0] as { n: number }).n);
  if (n > 0) {
    return { seeded: false, characters: n, places: 0 };
  }
  await db.insert(places).values(SEED_PLACES.map((p) => ({ ...p, is_seed: true }))).onConflictDoNothing();
  await db.insert(characters).values(SEED_CHARACTERS.map((c) => ({ ...c, is_seed: true }))).onConflictDoNothing();
  return { seeded: true, characters: SEED_CHARACTERS.length, places: SEED_PLACES.length };
}

// CLI entrypoint (parallels scripts/seed-players.ts). Only runs when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedWorld()
    .then((r) => {
      console.log(r.seeded ? `seeded ${r.characters} characters, ${r.places} places` : `roster already has ${r.characters} character(s) — skipping seed (empty-DB only).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("world seed failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
```

> The `import.meta.url` guard lets the same module export `seedWorld()` for tests AND run as a CLI script. `scripts/seed-players.ts` calls `main()` unconditionally; here we guard so importing it in a test doesn't trigger `process.exit`.

- [ ] **Step 5: Add the package.json script**

In `apps/server/package.json` scripts block, add after the existing `db:seed` line:

```json
    "db:seed:world": "tsx --env-file=.env scripts/seed-world.ts",
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test seed-world`
Expected: PASS — both the populate and the empty-guard cases.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/seed/mapleHollow.ts apps/server/scripts/seed-world.ts apps/server/scripts/seed-world.test.ts apps/server/package.json
git commit -m "3c: curated Maple Hollow seed + empty-guarded db:seed:world"
```

---

## Task 4: `selectCastPool` (roster → cast pool)

**Files:**
- Create: `apps/server/src/services/generation/roster.ts`
- Create: `apps/server/src/services/generation/roster.selectCastPool.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/generation/roster.selectCastPool.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test/db.js";
import { getDb } from "../../db/client.js";
import { characters, places } from "../../db/schema.js";
import { selectCastPool } from "./roster.js";

beforeEach(() => { setupTestDb(); });
afterEach(() => {});

async function seedSome(): Promise<void> {
  const db = getDb();
  await db.insert(places).values(
    Array.from({ length: 5 }, (_, i) => ({ id: `place-${i}`, name: `Place ${i}`, description: "d", is_seed: true })),
  );
  await db.insert(characters).values(
    Array.from({ length: 10 }, (_, i) => ({ id: `char-${i}`, name: `Char ${i}`, description: "d", is_seed: true })),
  );
}

describe("selectCastPool", () => {
  it("returns 4-6 characters and 1-2 places drawn from the roster", async () => {
    await seedSome();
    const pool = await selectCastPool(getDb());
    expect(pool.characters.length).toBeGreaterThanOrEqual(4);
    expect(pool.characters.length).toBeLessThanOrEqual(6);
    expect(pool.places.length).toBeGreaterThanOrEqual(1);
    expect(pool.places.length).toBeLessThanOrEqual(2);
    const ids = new Set(pool.characters.map((c) => c.id));
    expect(ids.size).toBe(pool.characters.length); // no duplicates
    for (const c of pool.characters) expect(c.id).toMatch(/^char-\d+$/);
  });

  it("returns an empty pool when the roster is empty (fail-soft, preserves legacy generation)", async () => {
    const pool = await selectCastPool(getDb());
    expect(pool.characters).toEqual([]);
    expect(pool.places).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test roster.selectCastPool`
Expected: FAIL — cannot find module `./roster.js`.

- [ ] **Step 3: Implement `selectCastPool`**

Create `apps/server/src/services/generation/roster.ts`:

```typescript
import { getDb } from "../../db/client.js";
import { characters, places } from "../../db/schema.js";

type Db = ReturnType<typeof getDb>;

export interface CastPoolCharacter {
  id: string;
  name: string;
  description: string;
  traits: string | null;
}
export interface CastPoolPlace {
  id: string;
  name: string;
  description: string;
}
export interface CastPool {
  characters: CastPoolCharacter[];
  places: CastPoolPlace[];
}

/** Pick a random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Return a random subset of `arr` whose size is clamp(desired, 0, arr.length). */
function pickRandom<T>(arr: T[], min: number, max: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const want = Math.min(randInt(min, max), shuffled.length);
  return shuffled.slice(0, want);
}

/**
 * Select a cast pool for one mystery: 4-6 roster characters + 1-2 places.
 * Returns an EMPTY pool if the roster is empty — generation then falls back to
 * its legacy behavior (model invents the cast freely). Never throws on empty.
 */
export async function selectCastPool(db: Db): Promise<CastPool> {
  const chars = await db
    .select({ id: characters.id, name: characters.name, description: characters.description, traits: characters.traits })
    .from(characters);
  const plcs = await db
    .select({ id: places.id, name: places.name, description: places.description })
    .from(places);
  return {
    characters: pickRandom(chars, 4, 6),
    places: pickRandom(plcs, 1, 2),
  };
}
```

> **Open question (do not silently decide):** cast-pool weighting is pure random for v1 per the spec's recommendation; under-used-resident weighting is a future refinement. Leave as random.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test roster.selectCastPool`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/generation/roster.ts apps/server/src/services/generation/roster.selectCastPool.test.ts
git commit -m "3c: selectCastPool — random 4-6 cast + 1-2 places, empty-safe"
```

---

## Task 5: `extractAppearances` (post-`ready` projection)

**Files:**
- Modify: `apps/server/src/services/generation/roster.ts` (add `extractAppearances`)
- Create: `apps/server/src/services/generation/roster.extractAppearances.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/services/generation/roster.extractAppearances.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { LogicStructure } from "@mysterio/shared";
import { setupTestDb } from "../../test/db.js";
import { getDb } from "../../db/client.js";
import { characters, places, caseAppearances, mysteries } from "../../db/schema.js";
import { extractAppearances } from "./roster.js";

beforeEach(() => { setupTestDb(); });
afterEach(() => {});

/** A logic structure casting one EXISTING roster resident + one NEW resident + the detective. */
function logicFixture(): LogicStructure {
  return {
    category: "missing-pet",
    setting: "A quiet morning at The Maple Diner on Main Street.",
    characters: [
      { id: "you", name: "You", role: "detective", description: "You are the detective on this case.", is_culprit: false, motive: null },
      { id: "diner-owner-rosa-pine", name: "Rosa Pine", role: "witness", description: "Diner owner.", is_culprit: false, motive: null },
      { id: "newcomer-finn", name: "Finn", role: "suspect", description: "A new face in town.", is_culprit: true, motive: "wanted the prize rabbit" },
    ],
    essential_clues: [
      { id: "c1", description: "A trail of clover leads out the diner's back door.", category_type: "location" },
      { id: "c2", description: "A muddy boot print sits by the booth.", category_type: "item" },
      { id: "c3", description: "The latch on the hutch was lifted, not broken.", category_type: "event" },
    ],
    false_clues: [{ id: "f1", description: "A window was left open." }],
    true_solution: { who_did_it: "newcomer-finn", how: "lifted the latch", why: "wanted the prize rabbit" },
    how_distractors: ["a fox dug under", "the latch broke", "it wandered off"],
    why_distractors: ["for a prank", "by accident", "to sell it"],
    logic_chain: ["Finn left the clover trail", "Finn lifted the latch", "Finn took the rabbit"],
    central_question: "Who slipped the rabbit out of the diner, how, and why?",
  };
}

async function setupMysteryAndRoster(): Promise<void> {
  const db = getDb();
  await db.insert(places).values({ id: "maple-diner", name: "The Maple Diner", description: "d", is_seed: true });
  await db.insert(characters).values({ id: "diner-owner-rosa-pine", name: "Rosa Pine", description: "Diner owner.", is_seed: true });
  await db.insert(mysteries).values({ id: "m1", category: "missing-pet", difficulty: "easy", status: "ready" });
}

describe("extractAppearances", () => {
  it("upserts only NEW residents, writes appearances, and sets place_id by name match", async () => {
    await setupMysteryAndRoster();
    const db = getDb();
    await extractAppearances(db, { mysteryId: "m1", logic: logicFixture(), places: [{ id: "maple-diner", name: "The Maple Diner" }] });

    const chars = await db.select().from(characters);
    expect(chars.map((c) => c.id).sort()).toEqual(["diner-owner-rosa-pine", "newcomer-finn"]); // 1 new upserted
    const newChar = chars.find((c) => c.id === "newcomer-finn")!;
    expect(newChar.is_seed).toBe(false);

    const apps = await db.select().from(caseAppearances).where(eq(caseAppearances.mystery_id, "m1"));
    expect(apps).toHaveLength(2); // detective excluded
    const culprit = apps.find((a) => a.character_id === "newcomer-finn")!;
    expect(culprit.is_culprit).toBe(true);
    expect(culprit.role_in_case).toBe("suspect");
    expect(culprit.motive).toBe("wanted the prize rabbit");
    const witness = apps.find((a) => a.character_id === "diner-owner-rosa-pine")!;
    expect(witness.is_culprit).toBe(false);
    expect(witness.role_in_case).toBe("witness");

    const m = await db.select().from(mysteries).where(eq(mysteries.id, "m1"));
    expect(m[0].place_id).toBe("maple-diner");
  });

  it("is idempotent (re-running does not duplicate appearances)", async () => {
    await setupMysteryAndRoster();
    const db = getDb();
    const args = { mysteryId: "m1", logic: logicFixture(), places: [{ id: "maple-diner", name: "The Maple Diner" }] };
    await extractAppearances(db, args);
    await extractAppearances(db, args);
    const apps = await db.select().from(caseAppearances).where(eq(caseAppearances.mystery_id, "m1"));
    expect(apps).toHaveLength(2);
  });

  it("leaves place_id null when no pool place name appears in the setting (non-fatal)", async () => {
    await setupMysteryAndRoster();
    const db = getDb();
    const logic = logicFixture();
    logic.setting = "A foggy night somewhere with no named place.";
    await extractAppearances(db, { mysteryId: "m1", logic, places: [{ id: "maple-diner", name: "The Maple Diner" }] });
    const m = await db.select().from(mysteries).where(eq(mysteries.id, "m1"));
    expect(m[0].place_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mysterio/server test roster.extractAppearances`
Expected: FAIL — `extractAppearances` is not exported.

- [ ] **Step 3: Implement `extractAppearances`**

Append to `apps/server/src/services/generation/roster.ts`:

```typescript
import { eq, inArray } from "drizzle-orm";
import type { LogicStructure } from "@mysterio/shared";
import { caseAppearances, mysteries } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";

export interface ExtractArgs {
  mysteryId: string;
  logic: LogicStructure;
  /** The cast pool's places, used to match a roster place_id from the free-text setting. */
  places: CastPoolPlace[];
}

/**
 * Derive the World tables from a finalized mystery's logic structure:
 *  - upsert any NEW resident (role != detective, id not already in `characters`) — identity only;
 *  - write one case_appearances row per non-detective character (role/culprit/motive);
 *  - set mysteries.place_id when a pool place's name appears in the setting.
 * Idempotent (unique mystery_id+character_id). The CALLER wraps this in try/catch (fail-soft):
 * a throw here must never fail an otherwise-good mystery.
 */
export async function extractAppearances(db: Db, args: ExtractArgs): Promise<void> {
  const { mysteryId, logic } = args;
  const cast = logic.characters.filter((c) => c.role !== "detective");
  if (cast.length === 0) return;

  // Which cast members already exist in `characters`?
  const ids = cast.map((c) => c.id);
  const existing = await db.select({ id: characters.id }).from(characters).where(inArray(characters.id, ids));
  const existingIds = new Set(existing.map((r) => r.id));
  const newOnes = cast.filter((c) => !existingIds.has(c.id));

  if (newOnes.length > 1) {
    // Soft over-invention guard: persist all, but flag it. Never reject a good mystery.
    logger.info("extract_over_invention", { mystery_id: mysteryId, new_count: newOnes.length, ids: newOnes.map((c) => c.id) });
  }

  // Upsert new residents (identity only — NO role/culprit/motive lives in `characters`).
  if (newOnes.length > 0) {
    await db
      .insert(characters)
      .values(newOnes.map((c) => ({ id: c.id, name: c.name, description: c.description, traits: null, is_seed: false })))
      .onConflictDoNothing();
  }

  // Write per-case appearances (idempotent on (mystery_id, character_id)).
  await db
    .insert(caseAppearances)
    .values(
      cast.map((c) => ({
        id: `${mysteryId}_${c.id}`,
        mystery_id: mysteryId,
        character_id: c.id,
        role_in_case: c.role, // 'suspect' | 'witness' | 'bystander' (detective already filtered)
        is_culprit: c.is_culprit,
        motive: c.motive,
      })),
    )
    .onConflictDoNothing();

  // Match a roster place_id by case-insensitive name substring in the setting.
  const setting = logic.setting.toLowerCase();
  const matched = args.places.find((p) => setting.includes(p.name.toLowerCase()));
  if (matched) {
    await db.update(mysteries).set({ place_id: matched.id }).where(eq(mysteries.id, mysteryId));
  }
}
```

> Move/merge the `import` statements to the top of the file with the existing imports rather than mid-file (the block above lists them for clarity; ESM requires top-level imports). `eq`/`inArray` come from `drizzle-orm`.
>
> **Open questions honored (do not silently decide):** over-invention is *soft* (persist-all-with-warn) per spec recommendation; name/id collision is matched on **id only** — a reused name with a new id is treated as a new resident (and naturally persisted). Both are logged, neither fails the mystery.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mysterio/server test roster.extractAppearances`
Expected: PASS — all three cases (upsert+appearances+place, idempotency, null-place).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/generation/roster.ts apps/server/src/services/generation/roster.extractAppearances.test.ts
git commit -m "3c: extractAppearances — projection of logic_structure into World tables (fail-soft, idempotent)"
```

---

## Task 6: Inject the cast pool into the logic prompt

**Files:**
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts` (static rules)
- Modify: `apps/server/src/services/generation/agents/logicStructureAgent.ts` (dynamic cast list in user message)
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.test.ts` (new assertion)
- Create: `apps/server/src/services/generation/agents/logicStructureAgent.castPool.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/server/src/services/generation/prompts/logicStructure.system.test.ts` (inside the existing `describe`):

```typescript
  it("includes the CAST FROM ROSTER convention", () => {
    const s = buildLogicStructureSystem("easy", "10-11");
    expect(s).toContain("CAST FROM THE TOWN ROSTER");
    expect(s.toLowerCase()).toContain("at most one");
  });
```

Create `apps/server/src/services/generation/agents/logicStructureAgent.castPool.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildCastPoolUserSection } from "./logicStructureAgent.js";

describe("buildCastPoolUserSection", () => {
  it("lists provided residents and places with their exact ids", () => {
    const section = buildCastPoolUserSection({
      characters: [{ id: "rosa-pine", name: "Rosa Pine", description: "Diner owner.", traits: "warm" }],
      places: [{ id: "maple-diner", name: "The Maple Diner", description: "A diner." }],
    });
    expect(section).toContain("rosa-pine");
    expect(section).toContain("Rosa Pine");
    expect(section).toContain("The Maple Diner");
    expect(section.toLowerCase()).toContain("at most one");
  });

  it("returns an empty string when the pool has no characters (legacy generation path)", () => {
    expect(buildCastPoolUserSection({ characters: [], places: [] })).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mysterio/server test logicStructure.system logicStructureAgent.castPool`
Expected: FAIL — `CAST FROM THE TOWN ROSTER` absent; `buildCastPoolUserSection` not exported.

- [ ] **Step 3: Add the static rules to the system prompt**

In `apps/server/src/services/generation/prompts/logicStructure.system.ts`, inside the `DESIGN RULES:` block (after the "Characters must have distinct, age-appropriate names" rule), add:

```
- CAST FROM THE TOWN ROSTER: when the user message provides a list of Maple Hollow townsfolk, you MUST cast this mystery's suspects, witnesses, and bystanders from that list — reuse each person's EXACT id and name and stay true to their description. You MAY introduce AT MOST ONE brand-new resident (with a fresh kebab-case id) if the plot genuinely needs it; otherwise use only the provided townsfolk. The detective character ("You") is always separate and is never drawn from the roster. When a list of town places is provided, set the case in ONE of them and weave that place's name into the setting text.
```

Insert it as a plain line in the template literal (no interpolation needed). Keep it within the `DESIGN RULES` bullet list so the existing tests still pass.

- [ ] **Step 4: Thread the cast pool through the agent**

In `apps/server/src/services/generation/agents/logicStructureAgent.ts`:

(a) Add the import and extend the input type:

```typescript
import type { CastPool } from "../roster.js";
```

```typescript
export interface LogicStructureAgentInput {
  category: CategoryId;
  difficulty: DifficultyId;
  ageRange: AgeRange;
  previousFailureNotes?: string;
  castPool?: CastPool;
}
```

(b) Add an exported helper (used by the user-message builder and unit-tested directly):

```typescript
export function buildCastPoolUserSection(pool?: CastPool): string {
  if (!pool || pool.characters.length === 0) return "";
  const people = pool.characters
    .map((c) => `- id "${c.id}", ${c.name}: ${c.description}${c.traits ? ` (traits: ${c.traits})` : ""}`)
    .join("\n");
  const placeLines = pool.places.map((p) => `- ${p.name}: ${p.description}`).join("\n");
  const placePart = placeLines
    ? `\n\nSet this case in ONE of these Maple Hollow places (weave its name into the setting):\n${placeLines}`
    : "";
  return `\n\nCast this mystery from these Maple Hollow townsfolk — reuse each one's EXACT id and name as suspects/witnesses/bystanders. You may add AT MOST ONE new resident if the plot needs it:\n${people}${placePart}`;
}
```

(c) Append the section in `buildUserMessage` by changing the `base` line:

```typescript
function buildUserMessage(input: LogicStructureAgentInput, lastError?: string): string {
  const base = `Generate a ${input.difficulty} ${input.category} mystery.${buildCastPoolUserSection(input.castPool)}`;
  // ...rest unchanged
```

(The `previousFailureNotes` and `lastError` branches already build on `base`, so the cast section flows through every attempt.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mysterio/server test logicStructure.system logicStructureAgent.castPool`
Expected: PASS. Also run `pnpm --filter @mysterio/server typecheck` (the new `CastPool` import must resolve).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/prompts/logicStructure.system.ts apps/server/src/services/generation/prompts/logicStructure.system.test.ts apps/server/src/services/generation/agents/logicStructureAgent.ts apps/server/src/services/generation/agents/logicStructureAgent.castPool.test.ts
git commit -m "3c: inject roster cast pool into logic prompt (static rule + dynamic user-message list)"
```

---

## Task 7: Wire the orchestrator (select pool → generate → extract)

**Files:**
- Modify: `apps/server/src/services/generation/orchestrator.ts`

> No new unit test: the orchestrator has no existing test harness (it is `vi.mock`'d in route tests), and wiring two already-tested functions into it does not warrant a heavy whole-pipeline mock. Behavior is covered by Tasks 4–5. Verification = typecheck + the full existing suite staying green.

- [ ] **Step 1: Add imports**

In `apps/server/src/services/generation/orchestrator.ts`, add to the import block:

```typescript
import { selectCastPool, extractAppearances } from "./roster.js";
```

- [ ] **Step 2: Select the cast pool once, before the attempt loop**

Inside `runGeneration`, after `const db = getDb();` / `const env = loadEnv();` and before the `for` loop, add:

```typescript
    // 3c: pick a recurring cast pool from the Maple Hollow roster (empty if unseeded → legacy behavior).
    let castPool = { characters: [], places: [] } as Awaited<ReturnType<typeof selectCastPool>>;
    try {
      castPool = await selectCastPool(db);
    } catch (e) {
      log("cast_pool_select_failed", { err: e instanceof Error ? e.message : String(e) });
    }
```

- [ ] **Step 3: Pass the pool into Phase 1**

Change the `runLogicStructureAgent` call to include `castPool`:

```typescript
      const logicRes = await runLogicStructureAgent({
        category: input.category,
        difficulty: input.difficulty,
        ageRange: input.ageRange,
        previousFailureNotes,
        castPool,
      });
```

- [ ] **Step 4: Extract appearances at the `ready` transition (fail-soft)**

Immediately after the `db.update(...).set({ status: "ready", ... })` call and before `log("generation_complete", ...)`, add:

```typescript
        // 3c: project the finalized logic structure into the World tables. Enhancement, not
        // correctness — never fail a good mystery on a linkage error.
        try {
          await extractAppearances(db, { mysteryId: input.mysteryId, logic, places: castPool.places });
        } catch (e) {
          log("extract_appearances_failed", { err: e instanceof Error ? e.message : String(e) });
        }
```

- [ ] **Step 5: Verify typecheck + full suite green**

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/server test`
Expected: PASS — no regressions; the existing solvability/validation tests are unaffected (the JSON pipeline is untouched).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/generation/orchestrator.ts
git commit -m "3c: orchestrator casts from roster (Phase 1) + extracts appearances at ready (fail-soft)"
```

---

## Task 8: Read APIs (`/characters`, `/characters/:id`, `/places`) with spoiler redaction

**Files:**
- Create: `apps/server/src/routes/characters.ts`
- Create: `apps/server/src/routes/places.ts`
- Create: `apps/server/src/routes/characters.test.ts`
- Create: `apps/server/src/routes/places.test.ts`
- Modify: `apps/server/src/index.ts` (register both plugins)

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/routes/characters.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { characters, caseAppearances, mysteries, solutions } from "../db/schema.js";
import { charactersRoutes } from "./characters.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  const db = getDb();
  await db.insert(characters).values([
    { id: "rosa-pine", name: "Rosa Pine", description: "Diner owner.", is_seed: true },
    { id: "finn", name: "Finn", description: "A newcomer.", is_seed: false },
  ]);
  await db.insert(mysteries).values([
    { id: "solved-case", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Solved One" },
    { id: "open-case", category: "missing-pet", difficulty: "easy", status: "ready", title: "The Open One" },
  ]);
  await db.insert(caseAppearances).values([
    { id: "a1", mystery_id: "solved-case", character_id: "finn", role_in_case: "suspect", is_culprit: true, motive: "greed" },
    { id: "a2", mystery_id: "open-case", character_id: "finn", role_in_case: "suspect", is_culprit: true, motive: "revenge" },
    { id: "a3", mystery_id: "solved-case", character_id: "rosa-pine", role_in_case: "witness", is_culprit: false, motive: null },
  ]);
  // player "p1" solved solved-case, has NOT resolved open-case
  await db.insert(solutions).values({
    id: "s1", mystery_id: "solved-case", player_id: "p1", is_correct: true,
  } as never);
  app = Fastify();
  await app.register(charactersRoutes, { prefix: "/api" });
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("GET /api/characters", () => {
  it("lists roster characters with a spoiler-safe appearance_count", async () => {
    const res = await app.inject({ method: "GET", url: "/api/characters" });
    expect(res.statusCode).toBe(200);
    const list = res.json().characters as Array<{ id: string; appearance_count: number }>;
    const finn = list.find((c) => c.id === "finn")!;
    expect(finn.appearance_count).toBe(2);
    const rosa = list.find((c) => c.id === "rosa-pine")!;
    expect(rosa.appearance_count).toBe(1);
    // no is_culprit leakage on the list
    expect(JSON.stringify(list)).not.toContain("is_culprit");
  });
});

describe("GET /api/characters/:id (spoiler redaction)", () => {
  it("reveals is_culprit/motive only for cases the player has resolved", async () => {
    const res = await app.inject({ method: "GET", url: "/api/characters/finn?player_id=p1" });
    expect(res.statusCode).toBe(200);
    const detail = res.json().character as { appearances: Array<{ mystery_id: string; is_culprit?: boolean; motive?: string | null }> };
    const solved = detail.appearances.find((a) => a.mystery_id === "solved-case")!;
    const open = detail.appearances.find((a) => a.mystery_id === "open-case")!;
    expect(solved.is_culprit).toBe(true);
    expect(solved.motive).toBe("greed");
    expect("is_culprit" in open).toBe(false); // redacted — player hasn't resolved this case
    expect("motive" in open).toBe(false);
  });

  it("404s an unknown character", async () => {
    const res = await app.inject({ method: "GET", url: "/api/characters/nope?player_id=p1" });
    expect(res.statusCode).toBe(404);
  });
});
```

Create `apps/server/src/routes/places.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { places } from "../db/schema.js";
import { placesRoutes } from "./places.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  await getDb().insert(places).values({ id: "maple-diner", name: "The Maple Diner", description: "A diner.", is_seed: true });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mysterio/server test routes/characters routes/places`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement the places route**

Create `apps/server/src/routes/places.ts`. The list returns only the wire fields `{ id, name, description, image_path }` (no `is_seed`/`created_at`):

```typescript
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";
import { places } from "../db/schema.js";

export async function placesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/places", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: places.id, name: places.name, description: places.description, image_path: places.image_path })
      .from(places);
    return { places: rows };
  });
}
```

- [ ] **Step 4: Implement the characters route (with redaction)**

Create `apps/server/src/routes/characters.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CharacterListItem, CharacterDetail, CharacterAppearance, RoleInCase } from "@mysterio/shared";
import { getDb } from "../db/client.js";
import { characters, caseAppearances, mysteries, solutions } from "../db/schema.js";

const detailQuery = z.object({ player_id: z.string().min(1) });

export async function charactersRoutes(app: FastifyInstance): Promise<void> {
  // List — spoiler-safe (count only, no per-case guilt).
  app.get("/characters", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: characters.id, name: characters.name, description: characters.description, portrait_image_path: characters.portrait_image_path })
      .from(characters);
    const appRows = await db.select({ character_id: caseAppearances.character_id }).from(caseAppearances);
    const counts = new Map<string, number>();
    for (const a of appRows) counts.set(a.character_id, (counts.get(a.character_id) ?? 0) + 1);
    const list: CharacterListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      portrait_image_path: r.portrait_image_path,
      appearance_count: counts.get(r.id) ?? 0,
    }));
    return { characters: list };
  });

  // Detail — appearances with is_culprit/motive redacted unless the player resolved that case.
  app.get<{ Params: { id: string } }>("/characters/:id", async (req, reply) => {
    const parsed = detailQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "player_id is required" });
    }
    const playerId = parsed.data.player_id;
    const db = getDb();

    const charRows = await db
      .select({ id: characters.id, name: characters.name, description: characters.description, portrait_image_path: characters.portrait_image_path })
      .from(characters)
      .where(eq(characters.id, req.params.id));
    if (charRows.length === 0) {
      return reply.code(404).send({ error: "character not found" });
    }
    const c = charRows[0];

    // Join appearances → mystery (title) → this player's solution (resolution state).
    const rows = await db
      .select({
        mystery_id: caseAppearances.mystery_id,
        title: mysteries.title,
        role_in_case: caseAppearances.role_in_case,
        is_culprit: caseAppearances.is_culprit,
        motive: caseAppearances.motive,
        resolved: sql<boolean>`(${solutions.id} IS NOT NULL AND (${solutions.is_correct} = true OR ${solutions.gave_up} = true))`,
      })
      .from(caseAppearances)
      .innerJoin(mysteries, eq(mysteries.id, caseAppearances.mystery_id))
      .leftJoin(solutions, and(eq(solutions.mystery_id, caseAppearances.mystery_id), eq(solutions.player_id, playerId)))
      .where(eq(caseAppearances.character_id, req.params.id));

    const appearances: CharacterAppearance[] = rows.map((r) => {
      const base: CharacterAppearance = {
        mystery_id: r.mystery_id,
        title: r.title,
        role_in_case: r.role_in_case as RoleInCase,
      };
      if (r.resolved) {
        base.is_culprit = r.is_culprit;
        base.motive = r.motive;
      }
      return base;
    });

    const detail: CharacterDetail = {
      id: c.id,
      name: c.name,
      description: c.description,
      portrait_image_path: c.portrait_image_path,
      appearances,
    };
    return { character: detail };
  });
}
```

- [ ] **Step 5: Register both plugins**

In `apps/server/src/index.ts`, alongside the existing `app.register(playersRoutes, { prefix: "/api" })` calls, add:

```typescript
import { charactersRoutes } from "./routes/characters.js";
import { placesRoutes } from "./routes/places.js";
// ...
await app.register(charactersRoutes, { prefix: "/api" });
await app.register(placesRoutes, { prefix: "/api" });
```

(Match the exact registration style already used in `index.ts` — `await app.register(...)` vs `app.register(...)`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @mysterio/server test routes/characters routes/places`
Expected: PASS — list count, redaction (revealed on solved / hidden on open), 404, places list.

- [ ] **Step 7: Verify full suite + typecheck**

Run: `pnpm --filter @mysterio/server typecheck && pnpm --filter @mysterio/server test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/routes/characters.ts apps/server/src/routes/places.ts apps/server/src/routes/characters.test.ts apps/server/src/routes/places.test.ts apps/server/src/index.ts
git commit -m "3c: read APIs for characters (spoiler-safe) + places"
```

---

## Task 9: Minimal Who's Who list (web)

**Files:**
- Create: `apps/web/src/api/world.ts`
- Create: `apps/web/src/screens/WhosWho/WhosWhoScreen.tsx`
- Modify: `apps/web/src/routes.tsx` (add `/whos-who`)
- Modify: `apps/web/src/screens/MainScreen/MainScreen.tsx` (header link)

> `apps/web` has no test runner; the gates are `typecheck` + `build`. Verify rendering manually after deploy (the iPad pass).

- [ ] **Step 1: Add the api client calls**

Create `apps/web/src/api/world.ts`:

```typescript
import type { CharacterListItem, CharacterDetail, Place } from "@mysterio/shared";
import { api } from "./client.js";

export function listCharacters(): Promise<{ characters: CharacterListItem[] }> {
  return api("/api/characters");
}

export function getCharacter(id: string, playerId: string): Promise<{ character: CharacterDetail }> {
  return api(`/api/characters/${encodeURIComponent(id)}?player_id=${encodeURIComponent(playerId)}`);
}

export function listPlaces(): Promise<{ places: Place[] }> {
  return api("/api/places");
}
```

- [ ] **Step 2: Build the Who's Who screen**

Create `apps/web/src/screens/WhosWho/WhosWhoScreen.tsx` (mirrors the inline-style / casebook-token pattern in `screens/MainScreen/RecentList.tsx`):

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCharacters } from "../../api/world.js";

/** Monogram fallback while portraits don't exist yet (portraits are 3d). */
function Monogram({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span
      style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center",
        background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)",
        fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--text-dim)",
      }}
    >
      {initials || "?"}
    </span>
  );
}

export function WhosWhoScreen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["characters"],
    queryFn: () => listCharacters(),
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Who's Who in Maple Hollow</h1>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 14 }}>← Back</Link>
      </header>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading the townsfolk…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load the town just now.</p>}
      {data && data.characters.length === 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No residents yet.</p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {data?.characters.map((c) => (
          <li
            key={c.id}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "var(--surface)", border: "1px solid var(--line)", padding: 12,
              borderRadius: "var(--radius)", boxShadow: "0 2px 0 rgba(0,0,0,0.15)",
            }}
          >
            <Monogram name={c.name} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis" }}>{c.description}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
              {c.appearance_count} {c.appearance_count === 1 ? "case" : "cases"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> Confirm the actual CSS token names by reading `RecentList.tsx` / the global stylesheet (`var(--surface)`, `var(--line)`, `var(--radius)`, `var(--text-dim)`, `var(--display)`, `var(--mono)`, `var(--pad-lg)` are used there). If any token differs, match what `RecentList.tsx` uses.

- [ ] **Step 3: Add the route**

In `apps/web/src/routes.tsx`, import and register the screen alongside the others:

```tsx
import { WhosWhoScreen } from "./screens/WhosWho/WhosWhoScreen.js";
// ...inside <RRRoutes>:
      <Route path="/whos-who" element={<WhosWhoScreen />} />
```

- [ ] **Step 4: Add the home-screen link**

In `apps/web/src/screens/MainScreen/MainScreen.tsx`, in the header `<div>` (the one holding the Switch button + Settings link), add a link before or after the Settings link, matching the 38×38 icon-button style:

```tsx
        <Link to="/whos-who" aria-label="Who's Who" title="Who's Who in Maple Hollow" style={{ width: 38, height: 38, borderRadius: 8, background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", display: "grid", placeItems: "center", textDecoration: "none", fontSize: 18 }}>
          🧑‍🤝‍🧑
        </Link>
```

(`Link` is already imported in `MainScreen.tsx`.)

- [ ] **Step 5: Verify typecheck + build**

Run: `pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build`
Expected: PASS — clean typecheck and a successful production build.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/world.ts apps/web/src/screens/WhosWho/ apps/web/src/routes.tsx apps/web/src/screens/MainScreen/MainScreen.tsx
git commit -m "3c: minimal Who's Who list screen + home link"
```

---

## Final verification (after all tasks)

- [ ] **Whole-repo gates green**

Run:
```bash
pnpm --filter @mysterio/shared test && pnpm --filter @mysterio/shared typecheck
pnpm --filter @mysterio/server test && pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/web typecheck && pnpm --filter @mysterio/web build
```
Expected: all PASS.

- [ ] **Migration applies on real Postgres** (not just pg-mem)

Against a scratch PG database: `DATABASE_URL=postgres://… pnpm --filter @mysterio/server db:migrate` then `pnpm --filter @mysterio/server db:seed:world`. Expected: migration applies clean; seeder reports `seeded N characters, M places`; a second `db:seed:world` run reports the skip message (empty-guard).

- [ ] **Acceptance criteria checklist** (from the spec):
  1. New tables + `place_id` migrate clean on real PG and pg-mem; seeder is empty-guarded. ✅ Tasks 2, 3
  2. A freshly generated mystery casts ≥3 suspects from the seed roster, sets a roster `place_id`, writes correct `case_appearances`; ≤1 new resident persisted. ✅ Tasks 6, 7 (behavior verified by Task 5 unit tests; confirm on the live smoke).
  3. Existing solvability gate unchanged and still green. ✅ Task 7 (JSON pipeline untouched; suite green).
  4. `GET /characters/:id` is spoiler-safe. ✅ Task 8
  5. Minimal Who's Who renders the roster on the deployed app. ✅ Task 9 (verify on the iPad pass)

- [ ] **Deploy to exe.dev** (`scripts/deploy.sh` from `feat/recurring-cast-3c`) and run a live generation smoke: generate one mystery, confirm it cast roster residents, `place_id` set, `case_appearances` written, Who's Who lists the roster. Then hand to the user for the iPad pass.

## Notes & deferrals (do not implement in 3c)

- Character/place **portraits** (gpt-image-1) → 3d.
- Town screen, map, character/place **detail pages**, full Who's Who → 3d.
- **Backfilling the legacy 24** mysteries into the roster → intentionally never.
- **Normalizing characters out of `logic_structure_json`** → never (JSON stays canonical; World tables are a projection).
- Roster CRUD / admin UI → out of scope (seed is code; new residents come only from generation).
- Open questions surfaced (random cast weighting, soft over-invention, id-only collision matching) are decided per the spec's v1 recommendations and are revisitable if the town feels lopsided.
