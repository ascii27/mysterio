import { describe, expect, it, vi } from "vitest";
import { resolveMysteryAudio } from "./mysteryAudio.js";

const readyRow = { id: "m1", status: "ready", narrative_text: "Once upon a time.", audio_path: null };

function deps(overrides = {}) {
  return {
    generateAudio: vi.fn(async () => ({ ok: true as const, audioPath: "m1.mp3" })),
    persistAudioPath: vi.fn(),
    ...overrides,
  };
}

describe("resolveMysteryAudio", () => {
  it("404s when the mystery does not exist", async () => {
    const d = deps();
    const out = await resolveMysteryAudio(undefined, d);
    expect(out.status).toBe(404);
    expect(d.generateAudio).not.toHaveBeenCalled();
  });

  it("returns the existing audio without re-synthesizing (idempotent)", async () => {
    const d = deps();
    const out = await resolveMysteryAudio({ ...readyRow, audio_path: "existing.mp3" }, d);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ audio_url: "/audio/existing.mp3" });
    expect(d.generateAudio).not.toHaveBeenCalled();
  });

  it("409s when the mystery is not ready", async () => {
    const d = deps();
    const out = await resolveMysteryAudio({ ...readyRow, status: "writing" }, d);
    expect(out.status).toBe(409);
    expect(d.generateAudio).not.toHaveBeenCalled();
  });

  it("409s when there is no narrative text", async () => {
    const d = deps();
    const out = await resolveMysteryAudio({ ...readyRow, narrative_text: null }, d);
    expect(out.status).toBe(409);
  });

  it("generates, persists, and returns the audio url", async () => {
    const d = deps();
    const out = await resolveMysteryAudio(readyRow, d);
    expect(d.generateAudio).toHaveBeenCalledWith("m1", "Once upon a time.");
    expect(d.persistAudioPath).toHaveBeenCalledWith("m1", "m1.mp3");
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ audio_url: "/audio/m1.mp3" });
  });

  it("502s when TTS fails", async () => {
    const d = deps({ generateAudio: vi.fn(async () => ({ ok: false as const, error: "provider down" })) });
    const out = await resolveMysteryAudio(readyRow, d);
    expect(out.status).toBe(502);
    expect(d.persistAudioPath).not.toHaveBeenCalled();
  });
});
