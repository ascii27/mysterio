import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const arrayBufferMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class {
      audio = { speech: { create: createMock } };
    },
  };
});

vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_API_KEY: "test-key" }),
}));

import { OpenAiProvider } from "./openai.js";

describe("OpenAiProvider", () => {
  beforeEach(() => {
    createMock.mockReset();
    arrayBufferMock.mockReset();
  });

  it("calls audio.speech.create with the expected arguments and returns a Buffer", async () => {
    const bytes = new Uint8Array([0x4d, 0x50, 0x33]); // "MP3"
    arrayBufferMock.mockResolvedValueOnce(bytes.buffer);
    createMock.mockResolvedValueOnce({ arrayBuffer: arrayBufferMock });

    const provider = new OpenAiProvider();
    const buf = await provider.synthesize("hello world", { voice: "fable", model: "tts-1-hd" });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      model: "tts-1-hd",
      voice: "fable",
      input: "hello world",
      response_format: "mp3",
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(Buffer.from(bytes).equals(buf)).toBe(true);
  });

  it("bubbles up SDK errors as thrown Error", async () => {
    createMock.mockRejectedValueOnce(new Error("openai 503"));
    const provider = new OpenAiProvider();
    await expect(
      provider.synthesize("hi", { voice: "fable", model: "tts-1-hd" }),
    ).rejects.toThrow("openai 503");
  });
});
