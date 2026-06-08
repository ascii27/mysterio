import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { players } from "../src/db/schema.js";

async function main(): Promise<void> {
  const db = getDb();
  const res = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM players`);
  const n = Number((res.rows[0] as { n: number }).n);
  if (n > 0) {
    console.log(`players table already has ${n} row(s) — skipping seed (empty-DB only).`);
    process.exit(0);
  }
  const rows = [
    { id: "p1", name: "Player One", default_difficulty: "easy" as const },
    { id: "p2", name: "Player Two", default_difficulty: "medium" as const },
  ];
  await db.insert(players).values(rows).onConflictDoNothing();
  console.log("seeded", rows.length, "players");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
