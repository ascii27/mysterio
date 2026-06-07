import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";

const { runAvatarImageAgent, deleteImageByKey } = vi.hoisted(() => ({
  runAvatarImageAgent: vi.fn(),
  deleteImageByKey: vi.fn(),
}));
vi.mock("../services/images/avatarImageAgent.js", () => ({ runAvatarImageAgent }));
vi.mock("../services/images/storage.js", () => ({ deleteImageByKey }));

import { setupTestDb } from "../test/db.js";
import { getDb } from "../db/client.js";
import { players } from "../db/schema.js";
import { playersRoutes } from "./players.js";

let app: FastifyInstance;
beforeEach(async () => {
  setupTestDb();
  runAvatarImageAgent.mockReset();
  deleteImageByKey.mockReset();
  await getDb().insert(players).values({ id: "p1", name: "Lily", age_range: "10-11", default_difficulty: "easy", avatar_description: "red hair" });
  app = Fastify();
  await app.register(playersRoutes);
  await app.ready();
});
afterEach(async () => { await app.close(); });

describe("POST /players/:id/avatar", () => {
  it("generates from the description, stores the key, returns the player", async () => {
    runAvatarImageAgent.mockResolvedValue({ ok: true, avatarImagePath: "avatars/p1-aaa.png" });
    const res = await app.inject({ method: "POST", url: "/players/p1/avatar" });
    expect(res.statusCode).toBe(200);
    expect(res.json().player.avatar_image_path).toBe("avatars/p1-aaa.png");
    expect(runAvatarImageAgent).toHaveBeenCalledWith({ playerId: "p1", description: "red hair" });
    const [row] = await getDb().select().from(players).where(eq(players.id, "p1")).limit(1);
    expect(row?.avatar_image_path).toBe("avatars/p1-aaa.png");
  });

  it("regenerating deletes the previous file", async () => {
    await getDb().update(players).set({ avatar_image_path: "avatars/p1-old.png" }).where(eq(players.id, "p1"));
    runAvatarImageAgent.mockResolvedValue({ ok: true, avatarImagePath: "avatars/p1-new.png" });
    await app.inject({ method: "POST", url: "/players/p1/avatar" });
    expect(deleteImageByKey).toHaveBeenCalledWith("avatars/p1-old.png");
  });

  it("400s when the description is empty", async () => {
    await getDb().update(players).set({ avatar_description: null }).where(eq(players.id, "p1"));
    const res = await app.inject({ method: "POST", url: "/players/p1/avatar" });
    expect(res.statusCode).toBe(400);
    expect(runAvatarImageAgent).not.toHaveBeenCalled();
  });

  it("404s on unknown id; 502s when the agent fails", async () => {
    expect((await app.inject({ method: "POST", url: "/players/nope/avatar" })).statusCode).toBe(404);
    runAvatarImageAgent.mockResolvedValue({ ok: false, error: "rate_limited" });
    expect((await app.inject({ method: "POST", url: "/players/p1/avatar" })).statusCode).toBe(502);
  });

  it("a failed regenerate keeps the existing avatar (no delete, row unchanged)", async () => {
    await getDb().update(players).set({ avatar_image_path: "avatars/p1-keep.png" }).where(eq(players.id, "p1"));
    runAvatarImageAgent.mockResolvedValue({ ok: false, error: "rate_limited" });
    const res = await app.inject({ method: "POST", url: "/players/p1/avatar" });
    expect(res.statusCode).toBe(502);
    expect(deleteImageByKey).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(players).where(eq(players.id, "p1")).limit(1);
    expect(row?.avatar_image_path).toBe("avatars/p1-keep.png");
  });
});
