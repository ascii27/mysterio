import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../src/test/db.js";
import { getDb } from "../src/db/client.js";
import { characters, places } from "../src/db/schema.js";
import { seedWorld } from "./seed-world.js";

beforeEach(() => { setupTestDb(); });

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
