import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, writeWorldImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  writeWorldImage: vi.fn(),
}));

vi.mock("./index.js", () => ({ defaultImageProvider: { generate } }));
vi.mock("./storage.js", () => ({ writeWorldImage }));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1" }),
}));

import { runTownMapAgent } from "./townMapAgent.js";

describe("runTownMapAgent", () => {
  beforeEach(() => { generate.mockReset(); writeWorldImage.mockReset(); });

  it("returns ok:false (never throws) when the provider fails", async () => {
    generate.mockRejectedValue(new Error("provider boom"));
    const res = await runTownMapAgent();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provider boom");
    expect(writeWorldImage).not.toHaveBeenCalled();
  });

  it("returns ok:true with the fixed world/town-map.png path on success", async () => {
    generate.mockResolvedValue(Buffer.from("png-bytes"));
    writeWorldImage.mockResolvedValue("world/town-map.png");
    const res = await runTownMapAgent();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.imagePath).toBe("world/town-map.png");
  });
});
