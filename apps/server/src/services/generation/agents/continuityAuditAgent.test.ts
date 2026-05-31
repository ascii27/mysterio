import { describe, expect, it } from "vitest";
import { runContinuityAuditAgent } from "./continuityAuditAgent.js";

const baseInput = {
  centralQuestion: "Who got past the latched gate to take the rabbit?",
  narrativeText: "Maya walked up the path. The rabbit was gone.",
  trueSolution: { who_did_it: "maya", how: "She lifted the latch on the gate.", why: "She wanted to help it." },
};

function fakeCall(json: string) {
  return async () => json;
}

describe("runContinuityAuditAgent", () => {
  it("reports a dangling element the story never establishes", async () => {
    const res = await runContinuityAuditAgent(baseInput, {
      call: fakeCall(JSON.stringify({
        dangling: [{ element: "the latch", where: "solution", note: "The story never mentions a latch." }],
      })),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dangling).toHaveLength(1);
  });

  it("returns an empty list when everything is established", async () => {
    const res = await runContinuityAuditAgent(baseInput, {
      call: fakeCall(JSON.stringify({ dangling: [] })),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dangling).toHaveLength(0);
  });
});
