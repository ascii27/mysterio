import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir = "";
vi.mock("../../config/env.js", () => ({ loadEnv: () => ({ IMAGE_DIR: dir }) }));

import { writeAvatarImage, deleteImageByKey } from "./storage.js";

describe("avatar storage", () => {
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "img-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("writes avatars/{playerId}-{token}.png and returns the key", async () => {
    const bytes = Buffer.from("png-bytes");
    const key = await writeAvatarImage("p-1", bytes);
    expect(key).toMatch(/^avatars\/p-1-[a-z0-9]+\.png$/);
    const written = await readFile(join(dir, key));
    expect(written.equals(bytes)).toBe(true);
  });

  it("deleteImageByKey removes a file and is a no-op on a missing file", async () => {
    const key = "avatars/p-1-abc.png";
    // missing file: must not throw
    await expect(deleteImageByKey(key)).resolves.toBeUndefined();
    // existing file: gets removed
    const real = await writeAvatarImage("p-2", Buffer.from("y"));
    await deleteImageByKey(real);
    await expect(access(join(dir, real))).rejects.toBeTruthy();
  });
});
