import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir = "";
vi.mock("../../config/env.js", () => ({ loadEnv: () => ({ IMAGE_DIR: dir }) }));

import { writeCoverImage } from "./storage.js";

describe("writeCoverImage", () => {
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "img-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("writes a .png named by mystery id and returns the file name", async () => {
    const bytes = Buffer.from("png-bytes");
    const name = await writeCoverImage("m-123", bytes);
    expect(name).toBe("m-123.png");
    const written = await readFile(join(dir, "m-123.png"));
    expect(written.equals(bytes)).toBe(true);
  });
});
