import { beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
vi.mock("openai", () => ({
  default: class {
    images = { generate: generateMock };
  },
}));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({ OPENAI_API_KEY: "test-key" }),
}));

import { OpenAiImageProvider } from "./openai.js";

describe("OpenAiImageProvider", () => {
  beforeEach(() => generateMock.mockReset());

  it("decodes b64_json into a Buffer", async () => {
    const png = Buffer.from("fake-png-bytes");
    generateMock.mockResolvedValue({ data: [{ b64_json: png.toString("base64") }] });
    const provider = new OpenAiImageProvider();
    const out = await provider.generate("a cozy scene", { model: "gpt-image-1", size: "1536x1024" });
    expect(out.equals(png)).toBe(true);
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-1", size: "1536x1024", prompt: "a cozy scene", n: 1 }),
    );
  });

  it("throws when the response has no image data", async () => {
    generateMock.mockResolvedValue({ data: [] });
    const provider = new OpenAiImageProvider();
    await expect(provider.generate("x", { model: "gpt-image-1", size: "1536x1024" })).rejects.toThrow("image_provider_no_data");
  });

  it("throws image_provider_invalid_size for an unknown size", async () => {
    const provider = new OpenAiImageProvider();
    await expect(
      provider.generate("x", { model: "gpt-image-1", size: "999x999" }),
    ).rejects.toThrow("image_provider_invalid_size");
    expect(generateMock).not.toHaveBeenCalled();
  });
});
