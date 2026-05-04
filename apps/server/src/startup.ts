import { notInArray } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { mysteries } from "./db/schema.js";
import { logger } from "./utils/logger.js";

export function markStaleMysteriesFailed(): void {
  const db = getDb();
  const result = db.update(mysteries)
    .set({ status: "failed", failure_reason: "server_restart" })
    .where(notInArray(mysteries.status, ["ready", "failed"]))
    .run();
  if (result.changes > 0) {
    logger.info("stale_mysteries_failed", { count: result.changes });
  }
}
