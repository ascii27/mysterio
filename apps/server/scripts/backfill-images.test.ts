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
