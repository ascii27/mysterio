import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { LogicStructure } from "@mysterio/shared";
import { setupTestDb } from "../../test/db.js";
import { getDb } from "../../db/client.js";
import { characters, places, caseAppearances, mysteries } from "../../db/schema.js";
import { extractAppearances } from "./roster.js";

beforeEach(() => { setupTestDb(); });

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
    expect(m[0]!.place_id).toBe("maple-diner");
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
    expect(m[0]!.place_id).toBeNull();
  });
});
