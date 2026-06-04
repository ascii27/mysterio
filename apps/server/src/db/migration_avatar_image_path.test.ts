import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./migrations", import.meta.url));

describe("avatar_image_path migration", () => {
  it("adds the column via ALTER TABLE, not a players rebuild (preserves FK-cascade children)", () => {
    const sql = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`${DIR}/${f}`, "utf8"))
      .find((s) => s.includes("avatar_image_path"));
    expect(sql, "no migration adds avatar_image_path").toBeTruthy();
    expect(sql!).toContain("ALTER TABLE");
    expect(sql!).not.toContain("__new_players");
    expect(sql!).not.toContain("DROP TABLE `players`");
  });
});
