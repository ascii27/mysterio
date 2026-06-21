import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate, writePlaceImage } = vi.hoisted(() => ({
  generate: vi.fn(),
  writePlaceImage: vi.fn(),
}));

vi.mock("./index.js", () => ({ defaultImageProvider: { generate } }));
vi.mock("./storage.js", () => ({ writePlaceImage }));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_IMAGE_MODEL: "gpt-image-1" }),
}));

import { runPlaceImageAgent } from "./placeImageAgent.js";

const input = { placeId: "maple-diner", name: "Maple Diner", description: "A cozy diner on the corner of Main Street." };

describe("runPlaceImageAgent", () => {
  beforeEach(() => { generate.mockReset(); writePlaceImage.mockReset(); });

  it("returns ok:false (never throws) when the provider fails", async () => {
    generate.mockRejectedValue(new Error("provider boom"));
    const res = await runPlaceImageAgent(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("provider boom");
    expect(writePlaceImage).not.toHaveBeenCalled();
  });

  it("returns ok:true with a versioned places/ path on success", async () => {
    generate.mockResolvedValue(Buffer.from("png-bytes"));
    writePlaceImage.mockResolvedValue("places/maple-diner-ab12cd34.png");
    const res = await runPlaceImageAgent(input);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.imagePath).toMatch(/^places\/maple-diner-[a-z0-9]+\.png$/);
    expect(generate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ size: "1024x1024" }));
  });

  it("returns ok:false (never throws) when storage throws", async () => {
    generate.mockResolvedValue(Buffer.from("png-bytes"));
    writePlaceImage.mockRejectedValue(new Error("disk_full"));
    const res = await runPlaceImageAgent(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("disk_full");
  });
});
