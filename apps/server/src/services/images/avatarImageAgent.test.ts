import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, writeAvatarImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  writeAvatarImage: vi.fn(),
}));

vi.mock("./index.js", () => ({ defaultImageProvider: { generate } }));
vi.mock("./storage.js", () => ({ writeAvatarImage }));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1" }),
}));

import { runAvatarImageAgent } from "./avatarImageAgent.js";

const input = { playerId: "p-1", description: "a kid with red hair" };

describe("runAvatarImageAgent", () => {
  beforeEach(() => { generate.mockReset(); writeAvatarImage.mockReset(); });

  it("generates a square portrait and returns ok + path", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeAvatarImage.mockResolvedValue("avatars/p-1-abc.png");
    const res = await runAvatarImageAgent(input);
    expect(res).toEqual({ ok: true, avatarImagePath: "avatars/p-1-abc.png" });
    expect(generate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ size: "1024x1024" }));
  });

  it("returns ok:false (never throws) when the provider throws", async () => {
    generate.mockRejectedValue(new Error("rate_limited"));
    const res = await runAvatarImageAgent(input);
    expect(res.ok).toBe(false);
    expect(writeAvatarImage).not.toHaveBeenCalled();
  });

  it("returns ok:false (never throws) when storage throws", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeAvatarImage.mockRejectedValue(new Error("disk_full"));
    const res = await runAvatarImageAgent(input);
    expect(res.ok).toBe(false);
  });
});
