import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

vi.mock("../services/generation/orchestrator.js", () => ({ runGeneration: vi.fn() }));
vi.mock("../services/generation/agents/ttsAgent.js", () => ({ runTtsAgent: vi.fn() }));

import { runGeneration } from "../services/generation/orchestrator.js";
import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players, mysteries } from "../db/schema.js";
import { mysteriesRoutes } from "./mysteries.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  await getDb().insert(players).values({ id: "p-young", name: "Kid", age_range: "8-9", default_difficulty: "easy" });
  app = Fastify();
  await app.register(mysteriesRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); vi.clearAllMocks(); });

describe("POST /mysteries/generate — presets", () => {
  it("reads the detective's preset difficulty + age band and threads them to generation", async () => {
    const res = await app.inject({
      method: "POST", url: "/mysteries/generate",
      payload: { player_id: "p-young" }, // no category, no difficulty
    });
    expect(res.statusCode).toBe(202);
    const id = res.json().mystery_id;
    const [row] = await getDb().select().from(mysteries).where(eq(mysteries.id, id)).limit(1);
    expect(row?.target_age_range).toBe("8-9");
    expect(row?.difficulty).toBe("easy"); // from player.default_difficulty
    expect(runGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ ageRange: "8-9", difficulty: "easy" }),
    );
  });

  it("honors a debug difficulty override in the body", async () => {
    const res = await app.inject({
      method: "POST", url: "/mysteries/generate",
      payload: { player_id: "p-young", difficulty: "hard" },
    });
    expect(res.statusCode).toBe(202);
    expect(runGeneration).toHaveBeenCalledWith(expect.objectContaining({ difficulty: "hard" }));
  });

  it("404s for an unknown player", async () => {
    const res = await app.inject({
      method: "POST", url: "/mysteries/generate", payload: { player_id: "nope" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /mysteries/:id returns target_age_range", async () => {
    await getDb().insert(mysteries).values({
      id: "m1", player_id: "p-young", category: "missing-pet",
      difficulty: "easy", status: "pending", target_age_range: "12-13",
    });
    const res = await app.inject({ method: "GET", url: "/mysteries/m1" });
    expect(res.json().target_age_range).toBe("12-13");
  });

  it("GET /mysteries/:id returns null target_age_range when not set", async () => {
    await getDb().insert(mysteries).values({
      id: "m2", player_id: "p-young", category: "missing-pet",
      difficulty: "easy", status: "pending",
    });
    const res = await app.inject({ method: "GET", url: "/mysteries/m2" });
    expect(res.json().target_age_range).toBeNull();
  });
});
