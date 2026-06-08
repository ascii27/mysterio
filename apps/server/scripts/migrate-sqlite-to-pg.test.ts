import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../src/test/db.js";
import { getDb } from "../src/db/client.js";
import { mysteries, players, solutions } from "../src/db/schema.js";
import { runEtl, toDate, toBool, toBoolN, parseJson } from "./migrate-sqlite-to-pg.js";

// Legacy SQLite schema: integer timestamps, integer booleans, TEXT json. Minimal columns the ETL reads.
function makeFixtureSqlite(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT, default_difficulty TEXT, age_range TEXT,
      avatar_description TEXT, avatar_image_path TEXT, created_at INTEGER);
    CREATE TABLE mysteries (id TEXT PRIMARY KEY, player_id TEXT, category TEXT, difficulty TEXT,
      target_age_range TEXT, status TEXT, title TEXT, logic_structure_json TEXT, narrative_text TEXT,
      narrative_annotations TEXT, audio_path TEXT, cover_image_path TEXT, validation_passed INTEGER,
      validation_attempts INTEGER, validation_notes TEXT, failure_reason TEXT, created_at INTEGER, ready_at INTEGER);
    CREATE TABLE clues (id TEXT PRIMARY KEY, mystery_id TEXT, player_id TEXT, category_type TEXT, content TEXT,
      audio_timestamp_ms INTEGER, source TEXT, annotation_id TEXT, created_at INTEGER);
    CREATE TABLE solutions (id TEXT PRIMARY KEY, mystery_id TEXT, player_id TEXT, guess_who TEXT, guess_how TEXT,
      guess_why TEXT, is_correct INTEGER, who_match INTEGER, how_match INTEGER, why_match INTEGER, hints_used INTEGER,
      gave_up INTEGER, explanation TEXT, created_at INTEGER);
    CREATE TABLE hints (id TEXT PRIMARY KEY, mystery_id TEXT, player_id TEXT, content TEXT, created_at INTEGER);
  `);
  db.prepare("INSERT INTO players VALUES (?,?,?,?,?,?,?)")
    .run("p1", "Ana", "easy", "10-11", null, null, 1778417000);
  db.prepare("INSERT INTO mysteries (id,player_id,category,difficulty,target_age_range,status,title,logic_structure_json,narrative_text,narrative_annotations,audio_path,cover_image_path,validation_passed,validation_attempts,validation_notes,failure_reason,created_at,ready_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("m1", "p1", "missing-pet", "easy", "10-11", "ready", "The Case",
      JSON.stringify({ central_question: "Who took it?", characters: [], true_solution: { who_did_it: "x", how: "y", why: "z" }, essential_clues: [], false_clues: [] }),
      "Once upon a time", JSON.stringify([{ type: "p", id: "1" }]), null, "covers/m1.png", 1, 1, null, null, 1778417645, 1778417651);
  // a failed mystery with null logic + null ready_at
  db.prepare("INSERT INTO mysteries (id,player_id,category,difficulty,status,validation_attempts,created_at) VALUES (?,?,?,?,?,?,?)")
    .run("m2", null, "locked-room", "hard", "failed", 3, 1778420000);
  db.prepare("INSERT INTO solutions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("s1", "m1", "p1", "x", "y", "z", 1, 1, 1, 1, 0, 0, "Nice work", 1780575526);
  return db;
}

describe("runEtl SQLite → Postgres", () => {
  beforeEach(() => setupTestDb());

  it("transform helpers convert types correctly", () => {
    expect(toDate(1778417645)).toEqual(new Date(1778417645 * 1000));
    expect(toDate(null)).toBeNull();
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBoolN(null)).toBeNull();
    expect(toBoolN(0)).toBe(false);
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson(null)).toBeNull();
  });

  it("copies all rows with correct count parity", async () => {
    const sqlite = makeFixtureSqlite();
    const report = await runEtl(sqlite, getDb() as any);
    sqlite.close();
    const by = Object.fromEntries(report.map((r) => [r.table, r]));
    expect(by.players).toMatchObject({ source: 1, inserted: 1 });
    expect(by.mysteries).toMatchObject({ source: 2, inserted: 2 });
    expect(by.solutions).toMatchObject({ source: 1, inserted: 1 });
    expect(by.clues).toMatchObject({ source: 0, inserted: 0 });
    expect(by.hints).toMatchObject({ source: 0, inserted: 0 });
  });

  it("preserves created_at (not now()) and converts jsonb + booleans", async () => {
    const sqlite = makeFixtureSqlite();
    await runEtl(sqlite, getDb() as any);
    sqlite.close();
    const db = getDb();
    const [m] = await db.select().from(mysteries).where(eq(mysteries.id, "m1")).limit(1);
    expect(m.created_at).toEqual(new Date(1778417645 * 1000)); // preserved, not now()
    expect(m.ready_at).toEqual(new Date(1778417651 * 1000));
    expect(m.logic_structure_json).toMatchObject({ central_question: "Who took it?" }); // jsonb object
    expect(m.validation_passed).toBe(true);
    const [m2] = await db.select().from(mysteries).where(eq(mysteries.id, "m2")).limit(1);
    expect(m2.logic_structure_json).toBeNull(); // null TEXT → null jsonb
    expect(m2.ready_at).toBeNull();
    const [s] = await db.select().from(solutions).where(eq(solutions.id, "s1")).limit(1);
    expect(s.is_correct).toBe(true);
    expect(s.gave_up).toBe(false);
    const [p] = await db.select().from(players).where(eq(players.id, "p1")).limit(1);
    expect(p.created_at).toEqual(new Date(1778417000 * 1000));
  });

  it("refuses to load into a non-empty target without --truncate", async () => {
    const sqlite = makeFixtureSqlite();
    await runEtl(sqlite, getDb() as any); // first load OK
    const sqlite2 = makeFixtureSqlite();
    await expect(runEtl(sqlite2, getDb() as any)).rejects.toThrow(/not empty/i);
    sqlite.close();
    sqlite2.close();
  });

  it("re-loads cleanly with truncate", async () => {
    const sqlite = makeFixtureSqlite();
    await runEtl(sqlite, getDb() as any);
    const report = await runEtl(makeFixtureSqlite(), getDb() as any, { truncate: true });
    expect(report.find((r) => r.table === "players")).toMatchObject({ inserted: 1 });
    sqlite.close();
  });
});
