import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import type { LogicStructure, NarrativeAnnotation } from "@mysterio/shared";

const { players, mysteries, clues, solutions, hints } = schema;
type Db = NodePgDatabase<typeof schema>;

// ---- per-column transforms (pure, unit-testable) ----
/** epoch-seconds int (SQLite) → JS Date (timestamptz). null-safe. */
export const toDate = (secs: number | null): Date | null =>
  secs == null ? null : new Date(secs * 1000);
/** SQLite 0/1/NULL → boolean/null. */
export const toBoolN = (v: number | null): boolean | null =>
  v == null ? null : v !== 0;
/** NOT-NULL boolean column: SQLite 0/1 → boolean (throws on null). */
export const toBool = (v: number | null): boolean => {
  if (v == null) throw new Error("toBool: unexpected null for a NOT NULL boolean column");
  return v !== 0;
};
/** TEXT JSON (SQLite) → parsed object (jsonb). null-safe. */
export const parseJson = <T>(s: string | null): T | null =>
  s == null ? null : (JSON.parse(s) as T);

const TABLES = ["players", "mysteries", "clues", "solutions", "hints"] as const;

export interface EtlReport {
  table: string;
  source: number;
  inserted: number;
}

/** Throws if any child row has a NULL player_id or mystery_id (both NOT NULL in PG) — fail loud, never drop. */
function assertChildFks(sqlite: Database.Database): void {
  for (const t of ["clues", "solutions", "hints"] as const) {
    for (const col of ["player_id", "mystery_id"] as const) {
      const bad = sqlite.prepare(`SELECT id FROM ${t} WHERE ${col} IS NULL LIMIT 5`).all() as { id: string }[];
      if (bad.length > 0) {
        throw new Error(`${t} has rows with NULL ${col} (cannot migrate to NOT NULL): ${bad.map((r) => r.id).join(", ")}`);
      }
    }
  }
}

export async function runEtl(
  sqlite: Database.Database,
  db: Db,
  opts: { truncate?: boolean } = {},
): Promise<EtlReport[]> {
  assertChildFks(sqlite);

  const report: EtlReport[] = [];

  await db.transaction(async (tx) => {
    // ---- no-double-load guard ----
    const existing: Record<string, number> = {};
    for (const t of TABLES) {
      const res = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)}`);
      existing[t] = Number((res.rows[0] as { n: number }).n);
    }
    const totalExisting = Object.values(existing).reduce((a, b) => a + b, 0);
    if (totalExisting > 0 && !opts.truncate) {
      throw new Error(
        `Target Postgres is not empty (${JSON.stringify(existing)}). Refusing to load. Pass --truncate to overwrite.`,
      );
    }
    if (totalExisting > 0 && opts.truncate) {
      // pg-mem 3.x does not support multi-table TRUNCATE; issue one statement per
      // table in FK-safe order (children before parents). RESTART IDENTITY omitted
      // because all PKs are text — no sequences to reset — so this is safe for
      // both pg-mem and real Postgres.
      await tx.execute(sql`TRUNCATE TABLE hints CASCADE`);
      await tx.execute(sql`TRUNCATE TABLE solutions CASCADE`);
      await tx.execute(sql`TRUNCATE TABLE clues CASCADE`);
      await tx.execute(sql`TRUNCATE TABLE mysteries CASCADE`);
      await tx.execute(sql`TRUNCATE TABLE players CASCADE`);
    }

    // ---- players ----
    const pRows = sqlite.prepare("SELECT * FROM players").all() as any[];
    if (pRows.length) {
      await tx.insert(players).values(pRows.map((r) => ({
        id: r.id,
        name: r.name,
        default_difficulty: r.default_difficulty,
        age_range: r.age_range,
        avatar_description: r.avatar_description,
        avatar_image_path: r.avatar_image_path,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- mysteries ----
    const mRows = sqlite.prepare("SELECT * FROM mysteries").all() as any[];
    if (mRows.length) {
      await tx.insert(mysteries).values(mRows.map((r) => ({
        id: r.id,
        player_id: r.player_id,
        category: r.category,
        difficulty: r.difficulty,
        target_age_range: r.target_age_range,
        status: r.status,
        title: r.title,
        logic_structure_json: parseJson<LogicStructure>(r.logic_structure_json),
        narrative_text: r.narrative_text,
        narrative_annotations: parseJson<NarrativeAnnotation[]>(r.narrative_annotations),
        audio_path: r.audio_path,
        cover_image_path: r.cover_image_path,
        validation_passed: toBoolN(r.validation_passed),
        validation_attempts: r.validation_attempts,
        validation_notes: r.validation_notes,
        failure_reason: r.failure_reason,
        created_at: toDate(r.created_at)!,
        ready_at: toDate(r.ready_at),
      })));
    }

    // ---- clues ----
    const cRows = sqlite.prepare("SELECT * FROM clues").all() as any[];
    if (cRows.length) {
      await tx.insert(clues).values(cRows.map((r) => ({
        id: r.id,
        mystery_id: r.mystery_id,
        player_id: r.player_id,
        category_type: r.category_type,
        content: r.content,
        audio_timestamp_ms: r.audio_timestamp_ms,
        source: r.source,
        annotation_id: r.annotation_id,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- solutions ----
    const sRows = sqlite.prepare("SELECT * FROM solutions").all() as any[];
    if (sRows.length) {
      await tx.insert(solutions).values(sRows.map((r) => ({
        id: r.id,
        mystery_id: r.mystery_id,
        player_id: r.player_id,
        guess_who: r.guess_who,
        guess_how: r.guess_how,
        guess_why: r.guess_why,
        is_correct: toBool(r.is_correct),
        who_match: toBoolN(r.who_match),
        how_match: toBoolN(r.how_match),
        why_match: toBoolN(r.why_match),
        hints_used: r.hints_used,
        gave_up: toBool(r.gave_up),
        explanation: r.explanation,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- hints ----
    const hRows = sqlite.prepare("SELECT * FROM hints").all() as any[];
    if (hRows.length) {
      await tx.insert(hints).values(hRows.map((r) => ({
        id: r.id,
        mystery_id: r.mystery_id,
        player_id: r.player_id,
        content: r.content,
        created_at: toDate(r.created_at)!,
      })));
    }

    // ---- count parity report ----
    const counts: Record<string, number> = { players: pRows.length, mysteries: mRows.length, clues: cRows.length, solutions: sRows.length, hints: hRows.length };
    for (const t of TABLES) {
      const res = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)}`);
      const n = Number((res.rows[0] as { n: number }).n);
      const inserted = n - (opts.truncate ? 0 : existing[t]);
      report.push({ table: t, source: counts[t], inserted });
      if (report[report.length - 1].inserted !== counts[t]) {
        throw new Error(`Count mismatch for ${t}: source ${counts[t]} != inserted ${inserted}`);
      }
    }
  });

  return report;
}

// ---- CLI ----
function parseArgs(argv: string[]): { sqlitePath: string; truncate: boolean } {
  let sqlitePath = process.env.SQLITE_DB_PATH ?? "";
  let truncate = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sqlite") sqlitePath = argv[++i] ?? "";
    else if (argv[i] === "--truncate") truncate = true;
  }
  if (!sqlitePath) throw new Error("Provide the SQLite DB path via --sqlite <path> or SQLITE_DB_PATH");
  return { sqlitePath, truncate };
}

async function main(): Promise<void> {
  const { sqlitePath, truncate } = parseArgs(process.argv.slice(2));
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const db = getDb() as unknown as Db;
  const report = await runEtl(sqlite, db, { truncate });
  sqlite.close();
  for (const r of report) console.log(`  ${r.table}: source=${r.source} inserted=${r.inserted}`);
  console.log("ETL complete — counts match.");
  process.exit(0);
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith("migrate-sqlite-to-pg.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error("ETL failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
