import { getDb } from "../src/db/client.js";
import { players } from "../src/db/schema.js";

const db = getDb();

const rows = [
  { id: "p1", name: "Player One", default_difficulty: "easy" as const },
  { id: "p2", name: "Player Two", default_difficulty: "medium" as const },
];

for (const r of rows) {
  db.insert(players).values(r).onConflictDoNothing().run();
}

console.log("seeded", rows.length, "players");
