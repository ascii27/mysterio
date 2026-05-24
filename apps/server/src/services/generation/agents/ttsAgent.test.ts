import { beforeEach, describe, expect, it, vi } from "vitest";

const { synthesizeMock, writeAudioMock } = vi.hoisted(() => ({
  synthesizeMock: vi.fn(),
  writeAudioMock: vi.fn(),
}));

vi.mock("../../tts/index.js", () => ({
  defaultProvider: { synthesize: synthesizeMock },
}));

vi.mock("../../tts/storage.js", () => ({
  writeAudio: writeAudioMock,
}));

vi.mock("../../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_TTS_MODEL: "tts-1-hd", OPENAI_TTS_VOICE: "fable" }),
}));

import { runTtsAgent } from "./ttsAgent.js";

describe("runTtsAgent", () => {
  beforeEach(() => {
    synthesizeMock.mockReset();
    writeAudioMock.mockReset();
  });

  it("succeeds on the first attempt", async () => {
    synthesizeMock.mockResolvedValueOnce(Buffer.from([1, 2, 3]));
    writeAudioMock.mockResolvedValueOnce("abc.mp3");

    const res = await runTtsAgent({ mysteryId: "abc", narrativeText: "Once upon a time..." });

    expect(res).toEqual({ ok: true, audioPath: "abc.mp3" });
    expect(synthesizeMock).toHaveBeenCalledTimes(1);
    expect(synthesizeMock).toHaveBeenCalledWith("Once upon a time...", {
      model: "tts-1-hd",
      voice: "fable",
    });
    expect(writeAudioMock).toHaveBeenCalledTimes(1);
    expect(writeAudioMock).toHaveBeenCalledWith("abc", Buffer.from([1, 2, 3]));
  });

  it("retries once on provider failure, then succeeds", async () => {
    synthesizeMock
      .mockRejectedValueOnce(new Error("openai 503"))
      .mockResolvedValueOnce(Buffer.from([9]));
    writeAudioMock.mockResolvedValueOnce("abc.mp3");

    const res = await runTtsAgent({ mysteryId: "abc", narrativeText: "x" });

    expect(res).toEqual({ ok: true, audioPath: "abc.mp3" });
    expect(synthesizeMock).toHaveBeenCalledTimes(2);
    expect(writeAudioMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false after two provider failures and does not call storage", async () => {
    synthesizeMock
      .mockRejectedValueOnce(new Error("openai 503"))
      .mockRejectedValueOnce(new Error("openai timeout"));

    const res = await runTtsAgent({ mysteryId: "abc", narrativeText: "x" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("openai timeout");
    expect(synthesizeMock).toHaveBeenCalledTimes(2);
    expect(writeAudioMock).not.toHaveBeenCalled();
  });

  it("does not retry on storage failure", async () => {
    synthesizeMock.mockResolvedValueOnce(Buffer.from([1]));
    writeAudioMock.mockRejectedValueOnce(new Error("ENOSPC: no space left on device"));

    const res = await runTtsAgent({ mysteryId: "abc", narrativeText: "x" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("ENOSPC");
    expect(synthesizeMock).toHaveBeenCalledTimes(1);
    expect(writeAudioMock).toHaveBeenCalledTimes(1);
  });
});
