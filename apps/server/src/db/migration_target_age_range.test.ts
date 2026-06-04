import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./migrations", import.meta.url));

describe("target_age_range migration", () => {
  it("adds the column via ALTER TABLE, not a table rebuild (preserves FK-cascade children)", () => {
    const sql = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`${DIR}/${f}`, "utf8"))
      .find((s) => s.includes("target_age_range"));
    expect(sql, "no migration adds target_age_range").toBeTruthy();
    expect(sql!).toContain("ALTER TABLE");
    expect(sql!).not.toContain("__new_mysteries");
    expect(sql!).not.toContain("DROP TABLE `mysteries`");
  });
});
