import { describe, expect, it } from "vitest";
import { runLogicStructureAgent } from "../../src/services/generation/agents/logicStructureAgent.js";
import { runValidationAgent } from "../../src/services/generation/agents/validationAgent.js";
import { compareSolutions } from "../../src/services/generation/compareSolutions.js";
import { redact } from "../../src/services/generation/redact.js";

const SHOULD_RUN = process.env.RUN_LIVE_LLM_TESTS === "1";

const RUNS = [
  { category: "missing-pet", difficulty: "easy" },
  { category: "missing-pet", difficulty: "medium" },
  { category: "haunted-mansion", difficulty: "easy" },
  { category: "haunted-mansion", difficulty: "medium" },
  { category: "stolen-treasure", difficulty: "easy" },
  { category: "stolen-treasure", difficulty: "medium" },
  { category: "locked-room", difficulty: "easy" },
  { category: "locked-room", difficulty: "medium" },
] as const;

describe.skipIf(!SHOULD_RUN)("validation pass-rate (live LLM)", () => {
  it("≥85% pass within 3 attempts across category × difficulty matrix", async () => {
    let passed = 0;
    let total = 0;
    for (const run of RUNS) {
      for (let i = 0; i < 3; i++) {
        total++;
        let success = false;
        let prevNotes: string | undefined;
        for (let attempt = 1; attempt <= 3 && !success; attempt++) {
          const lr = await runLogicStructureAgent({ category: run.category, difficulty: run.difficulty, previousFailureNotes: prevNotes });
          if (!lr.ok) { prevNotes = lr.error; continue; }
          const vr = await runValidationAgent(redact(lr.value));
          if (!vr.ok) { prevNotes = vr.error; continue; }
          const cmp = await compareSolutions(vr.value, lr.value.true_solution);
          if (cmp.passed) { success = true; break; }
          prevNotes = cmp.notes;
        }
        if (success) passed++;
      }
    }
    const rate = passed / total;
    console.log(`pass-rate: ${passed}/${total} = ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThanOrEqual(0.85);
  }, 30 * 60 * 1000);
});
