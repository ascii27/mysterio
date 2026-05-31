import { describe, expect, it } from "vitest";
import { runProseSolverAgent } from "./proseSolverAgent.js";

const characters = [
  { id: "maya", name: "Maya", role: "suspect", description: "The new kid next door." },
  { id: "theo", name: "Theo", role: "suspect", description: "Owns the rabbit." },
  { id: "officer-pat", name: "Officer Pat", role: "detective", description: "Neighborhood helper." },
];

const baseInput = {
  centralQuestion: "Who took the rabbit and why?",
  narrativeText: "Once upon a time...",
  characters,
};

function fakeCall(json: string) {
  return async () => json;
}

describe("runProseSolverAgent", () => {
  it("returns the parsed guess when the model answers with a valid character id", async () => {
    const res = await runProseSolverAgent(baseInput, {
      call: fakeCall(JSON.stringify({
        guess: { who: "maya", how: "She coaxed it out with a carrot.", why: "She wanted to nurse it back to health." },
        reasoning: "The carrot and the open hutch point to Maya.",
        confidence: 0.8,
      })),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.guess.who).toBe("maya");
  });

  it("fails (after retries) when the model returns an id not in the roster", async () => {
    const res = await runProseSolverAgent(baseInput, {
      call: fakeCall(JSON.stringify({
        guess: { who: "ghost", how: "Magic.", why: "Mischief." },
        reasoning: "A spooky vibe.",
        confidence: 0.9,
      })),
    });
    expect(res.ok).toBe(false);
  });
});
