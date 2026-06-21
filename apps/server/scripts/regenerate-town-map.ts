import { getDb } from "../src/db/client.js";
import { generateTownMapFromPlaces } from "../src/services/images/townMapAgent.js";

generateTownMapFromPlaces(getDb())
  .then((r) => {
    console.log(r.ok ? `town map regenerated from place references → ${r.imagePath}` : `town map regeneration failed: ${r.error}`);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("town map regeneration error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
