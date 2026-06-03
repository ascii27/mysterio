import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, writeCoverImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  writeCoverImage: vi.fn(),
}));

vi.mock("../../images/index.js", () => ({ defaultImageProvider: { generate } }));
vi.mock("../../images/storage.js", () => ({ writeCoverImage }));
vi.mock("../../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1", OPENAI_IMAGE_SIZE: "1536x1024" }),
}));

import { runCoverImageAgent } from "./coverImageAgent.js";

const input = {
  mysteryId: "m-1",
  category: "missing-pet" as const,
  title: "The Empty Hutch",
  centralQuestion: "Who took the rabbit, and how?",
  setting: "A cozy backyard.",
};

describe("runCoverImageAgent", () => {
  beforeEach(() => { generate.mockReset(); writeCoverImage.mockReset(); });

  it("returns ok + path on success", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeCoverImage.mockResolvedValue("m-1.png");
    const res = await runCoverImageAgent(input);
    expect(res).toEqual({ ok: true, coverImagePath: "m-1.png" });
  });

  it("returns ok:false (never throws) when the provider throws", async () => {
    generate.mockRejectedValue(new Error("rate_limited"));
    const res = await runCoverImageAgent(input);
    expect(res.ok).toBe(false);
    expect(writeCoverImage).not.toHaveBeenCalled();
  });

  it("returns ok:false (never throws) when storage throws", async () => {
    generate.mockResolvedValue(Buffer.from("png"));
    writeCoverImage.mockRejectedValue(new Error("disk_full"));
    const res = await runCoverImageAgent(input);
    expect(res.ok).toBe(false);
  });
});
