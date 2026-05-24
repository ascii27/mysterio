import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpRoot = mkdtempSync(join(tmpdir(), "mysterio-tts-storage-"));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ AUDIO_DIR: tmpRoot }),
}));

import { writeAudio } from "./storage.js";

describe("writeAudio", () => {
  it("writes the buffer to {AUDIO_DIR}/{id}.mp3 and returns the relative path", async () => {
    const id = "abc123";
    const bytes = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const rel = await writeAudio(id, bytes);
    expect(rel).toBe("abc123.mp3");

    const written = readFileSync(join(tmpRoot, "abc123.mp3"));
    expect(Buffer.compare(written, bytes)).toBe(0);
  });

  it("creates AUDIO_DIR if it does not exist", async () => {
    const innerDir = join(tmpRoot, "nested-subdir-that-does-not-exist");
    // Re-mock to point loadEnv at a fresh subdir. Ordering is load-bearing:
    // doMock (non-hoisting) registers the new factory, resetModules clears the
    // registry, then the dynamic import re-evaluates storage.js + env.js fresh
    // so it picks up innerDir. Reordering these silently reverts to tmpRoot.
    vi.doMock("../../config/env.js", () => ({
      loadEnv: () => ({ AUDIO_DIR: innerDir }),
    }));
    vi.resetModules();
    const { writeAudio: writeAudioReloaded } = await import("./storage.js");

    const rel = await writeAudioReloaded("xyz", Buffer.from([0xff]));
    expect(rel).toBe("xyz.mp3");
    const written = readFileSync(join(innerDir, "xyz.mp3"));
    expect(Buffer.compare(written, Buffer.from([0xff]))).toBe(0);
  });

  // Cleanup
  afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));
});
