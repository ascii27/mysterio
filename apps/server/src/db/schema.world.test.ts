import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../test/db.js";
import { getDb } from "./client.js";
import { characters, places, caseAppearances, mysteries } from "./schema.js";

beforeEach(() => { setupTestDb(); });

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
    expect(rows[0]?.role_in_case).toBe("suspect");

    // place_id round-trips through the column
    const mysteryRows = await db.select().from(mysteries).where(eq(mysteries.id, "m1"));
    expect(mysteryRows).toHaveLength(1);
    expect(mysteryRows[0]?.place_id).toBe("maple-diner");
  });

  it("rejects a duplicate (mystery_id, character_id) appearance", async () => {
    const db = getDb();
    await db.insert(places).values({ id: "maple-diner", name: "Diner", description: "A diner.", is_seed: true });
    await db.insert(characters).values({ id: "c1", name: "Cass", description: "A resident.", is_seed: true });
    await db.insert(mysteries).values({
      id: "m1", category: "missing-pet", difficulty: "easy", status: "ready", place_id: "maple-diner",
    });
    await db.insert(caseAppearances).values({
      id: "m1_c1", mystery_id: "m1", character_id: "c1", role_in_case: "suspect", is_culprit: false, motive: null,
    });
    // Same (mystery_id, character_id) pair with a different id must be rejected by the unique index.
    await expect(
      db.insert(caseAppearances).values({
        id: "m1_c1_dup", mystery_id: "m1", character_id: "c1", role_in_case: "witness", is_culprit: false, motive: null,
      }),
    ).rejects.toThrow();
  });
});
