import { notInArray } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { mysteries } from "./db/schema.js";
import { logger } from "./utils/logger.js";

export async function markStaleMysteriesFailed(): Promise<void> {
  const db = getDb();
  const updated = await db.update(mysteries)
    .set({ status: "failed", failure_reason: "server_restart" })
    .where(notInArray(mysteries.status, ["ready", "failed"]))
    .returning({ id: mysteries.id });
  if (updated.length > 0) {
    logger.info("stale_mysteries_failed", { count: updated.length });
  }
}
