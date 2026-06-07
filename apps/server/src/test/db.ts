/**
 * pg-mem test harness — provides an in-process Postgres-compatible DB for unit tests.
 *
 * pg-mem fallback: if it ever can't digest the baseline, escalate to Testcontainers
 * (real PG in Docker) per spec §5.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { newDb } from "pg-mem";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { __setTestDb } from "../db/client.js";
import * as schema from "../db/schema.js";

const MIGRATIONS = fileURLToPath(new URL("../db/migrations", import.meta.url));

/**
 * Strip pg-mem-incompatible constructs from a single SQL statement (after
 * splitting on `--> statement-breakpoint`).
 *
 * Transforms applied, each documented with rationale:
 *
 * 1. DO-block unwrap — pg-mem 3.x does not support PL/pgSQL anonymous blocks
 *    (`DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$`).
 *    We extract just the inner ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY
 *    statement. If pg-mem then rejects the bare FK ALTER TABLE (see transform 2),
 *    we skip it entirely.
 *
 * 2. FK-constraint skip — pg-mem 3.x does not support
 *    `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements at all.
 *    Route tests use app.inject and do not rely on DB-level FK cascade, so FK
 *    fidelity is not required for the test suite. Return "" to skip.
 *
 * 3. Partial unique index strip — pg-mem 3.x does not support partial indexes
 *    (`CREATE UNIQUE INDEX ... WHERE ...`). Strip the WHERE clause so it
 *    becomes a plain unique index. Tests don't insert conflicting
 *    NULL-annotation rows that would expose the difference.
 */
function unwrapForPgMem(raw: string): string {
  const stmt = raw.trim();
  if (!stmt) return "";

  // Transform 1: unwrap DO $$ BEGIN <inner>; EXCEPTION ... END $$; blocks
  const doBlockMatch = stmt.match(/DO \$\$ BEGIN\s*([\s\S]*?)\s*EXCEPTION/);
  if (doBlockMatch) {
    const inner = doBlockMatch[1].trim().replace(/;$/, "");

    // Transform 2: skip FK ALTER TABLE constraints — pg-mem doesn't support them,
    // and route tests don't rely on DB-level FK enforcement.
    if (/ALTER TABLE .* ADD CONSTRAINT .* FOREIGN KEY/i.test(inner)) {
      return "";
    }

    return inner;
  }

  // Transform 3: strip WHERE clause from partial unique indexes.
  // pg-mem doesn't support partial indexes; a plain unique index is close enough
  // for test scenarios (no NULL-annotation collision rows inserted in tests).
  if (/CREATE UNIQUE INDEX/i.test(stmt) && /\bWHERE\b/i.test(stmt)) {
    return stmt.replace(/\s+WHERE\s+[\s\S]+$/i, "");
  }

  return stmt;
}

/**
 * Patch a pg-mem Pool (MemPg) instance so it handles two constructs that
 * drizzle-orm/node-postgres sends but pg-mem 3.x doesn't support:
 *
 * a) `types.getTypeParser` in query config — drizzle always attaches a custom
 *    type-parser; pg-mem's `adaptQuery` throws NotSupported on it. We patch
 *    `adaptQuery` on the prototype to strip the `types` field before inspection.
 *    Safe: pg-mem does its own type casting.
 *
 * b) `rowMode: "array"` — drizzle requests positional-array rows for its mapped
 *    SELECT path; pg-mem's `adaptResults` throws NotSupported. We patch
 *    `adaptResults` on the prototype to handle rowMode by converting named-row
 *    result objects into positional arrays using the `fields` metadata. drizzle's
 *    `mapResultRow` then receives the positional arrays it expects.
 */
function patchPgMemPool(pool: any): any {
  // Each createPg() call produces a new MemPg class with a new prototype, so this
  // patch is NOT shared across setupTestDb() calls — no double-wrap risk. If
  // createPg() is ever hoisted out of setupTestDb(), add a proto.__patched guard.
  const proto = Object.getPrototypeOf(pool);

  // Patch adaptQuery: strip `types.getTypeParser` before pg-mem sees it
  const origAdaptQuery = proto.adaptQuery;
  proto.adaptQuery = function (query: any, values: any) {
    if (query && typeof query === "object" && query.types) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { types: _t, ...rest } = query;
      query = rest;
    }
    return origAdaptQuery.call(this, query, values);
  };

  // Patch adaptResults: handle rowMode: "array" by converting named rows to arrays
  // NOTE: reconstruction is name-based (row[name]). If a future query projects two
  // columns with the same output name (e.g. two unaliased .id columns from different
  // tables in a join), both positions collapse to the same value. Drizzle's
  // .select({ alias: table.col }) with unique keys avoids this — all current queries do.
  const origAdaptResults = proto.adaptResults;
  proto.adaptResults = function (query: any, res: any) {
    if (query && typeof query === "object" && query.rowMode === "array") {
      // pg-mem returns named-row objects; convert to positional arrays.
      // We need to call the original without rowMode so it doesn't throw,
      // then convert the resulting named rows to arrays.
      const queryWithoutMode = { ...query, rowMode: undefined };
      // Call the original adaptResults (which will copy rows / handle enum arrays)
      const adapted = origAdaptResults.call(this, queryWithoutMode, res);
      // Re-read fields from the raw result before adaptResults wipes them
      const rawFields = res.fields ?? [];
      const fieldNames: string[] = rawFields.map((f: any) => f.name);
      return {
        ...adapted,
        rows: adapted.rows.map((row: any) =>
          fieldNames.map((name: string) => row[name])
        ),
        // Restore real fields so drizzle's field-mapping can work
        fields: rawFields,
      };
    }
    return origAdaptResults.call(this, query, res);
  };

  // pool.connect() returns `this` in pg-mem (pool IS the client), so patching
  // the prototype covers both pool.query and client.query paths.

  return pool;
}

/** Fresh in-memory Postgres (pg-mem) with the baseline schema applied, injected into getDb(). Call in beforeEach. */
export function setupTestDb(): void {
  const mem = newDb();
  // Loads only the single squashed baseline migration. If/when additional migration
  // files land, apply ALL of them in sorted order, not just [0].
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()[0];
  const sqlText = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
  for (const raw of sqlText.split("--> statement-breakpoint")) {
    const stmt = unwrapForPgMem(raw);
    if (stmt) mem.public.none(stmt);
  }
  const { Pool } = mem.adapters.createPg();
  const pool = patchPgMemPool(new Pool());
  const db = drizzle(pool, { schema });
  __setTestDb(db);
}
