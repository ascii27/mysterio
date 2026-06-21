import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../test/db.js";
import { getDb } from "../../db/client.js";
import { characters, places } from "../../db/schema.js";
import { selectCastPool } from "./roster.js";

beforeEach(() => { setupTestDb(); });

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
