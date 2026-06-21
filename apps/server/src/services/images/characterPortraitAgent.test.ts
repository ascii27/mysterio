import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, writePortraitImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  writePortraitImage: vi.fn(),
}));

vi.mock("./index.js", () => ({ defaultImageProvider: { generate } }));
vi.mock("./storage.js", () => ({ writePortraitImage }));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1" }),
}));

import { runCharacterPortraitAgent } from "./characterPortraitAgent.js";

const input = { characterId: "rosa-pine", description: "Diner owner." };

describe("runCharacterPortraitAgent", () => {
  beforeEach(() => { generate.mockReset(); writePortraitImage.mockReset(); });

  it("returns ok:false (never throws) when the provider fails", async () => {
    generate.mockRejectedValue(new Error("provider boom"));
    const res = await runCharacterPortraitAgent(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provider boom");
    expect(writePortraitImage).not.toHaveBeenCalled();
  });

  it("returns ok:true with a versioned characters/ path on success", async () => {
    generate.mockResolvedValue(Buffer.from("png-bytes"));
    writePortraitImage.mockResolvedValue("characters/rosa-pine-ab12cd34.png");
    const res = await runCharacterPortraitAgent(input);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.portraitImagePath).toMatch(/^characters\/rosa-pine-[a-z0-9]+\.png$/);
    expect(generate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ size: "1024x1024" }));
  });

  it("returns ok:false (never throws) when storage throws", async () => {
    generate.mockResolvedValue(Buffer.from("png-bytes"));
    writePortraitImage.mockRejectedValue(new Error("disk_full"));
    const res = await runCharacterPortraitAgent(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("disk_full");
  });
});
