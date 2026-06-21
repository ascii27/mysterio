import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, editWithReferences, writeWorldImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  editWithReferences: vi.fn(),
  writeWorldImage: vi.fn(),
}));

vi.mock("./index.js", () => ({ defaultImageProvider: { generate, editWithReferences } }));
vi.mock("./storage.js", () => ({ writeWorldImage }));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1" }),
}));

import { runTownMapAgent } from "./townMapAgent.js";

describe("runTownMapAgent", () => {
  beforeEach(() => { generate.mockReset(); editWithReferences.mockReset(); writeWorldImage.mockReset(); });

  it("returns ok:false (never throws) when the provider fails", async () => {
    generate.mockRejectedValue(new Error("provider boom"));
    const res = await runTownMapAgent();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provider boom");
    expect(writeWorldImage).not.toHaveBeenCalled();
    expect(editWithReferences).not.toHaveBeenCalled();
  });

  it("returns ok:true with the fixed world/town-map.png path on success (no refs → uses generate)", async () => {
    generate.mockResolvedValue(Buffer.from("png-bytes"));
    writeWorldImage.mockResolvedValue("world/town-map.png");
    const res = await runTownMapAgent();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.imagePath).toBe("world/town-map.png");
    expect(generate).toHaveBeenCalledOnce();
    expect(editWithReferences).not.toHaveBeenCalled();
  });

  it("uses editWithReferences when references are provided", async () => {
    editWithReferences.mockResolvedValue(Buffer.from("edited-png-bytes"));
    writeWorldImage.mockResolvedValue("world/town-map.png");
    const ref = Buffer.from("ref");
    const res = await runTownMapAgent([ref]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.imagePath).toBe("world/town-map.png");
    expect(editWithReferences).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns ok:false (never throws) when editWithReferences fails", async () => {
    editWithReferences.mockRejectedValue(new Error("edit boom"));
    const ref = Buffer.from("ref");
    const res = await runTownMapAgent([ref]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("edit boom");
    expect(writeWorldImage).not.toHaveBeenCalled();
  });
});
