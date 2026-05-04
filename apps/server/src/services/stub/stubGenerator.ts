import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { mysteries } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";

const FAKE_NARRATIVE = `It was a quiet morning at Hazel's house when she noticed her cat, Biscuit, was missing. The food bowl was full. The window was open. And there were tiny pawprints leading toward the garden shed...`;

const FAKE_CHARACTERS = [
  { id: "hazel", name: "Hazel", role: "detective", description: "An eight-year-old who knows every cat on the block." },
  { id: "biscuit", name: "Biscuit", role: "witness", description: "A ginger cat with a taste for tuna." },
  { id: "neighbor", name: "Mr. Pemberton", role: "suspect", description: "The neighbor who is always complaining about cats in his garden." },
  { id: "sister", name: "Lulu", role: "suspect", description: "Hazel's little sister who recently asked for a kitten." },
];

const FAKE_FINAL = {
  title: "The Missing Biscuit",
  narrative_text: FAKE_NARRATIVE,
  audio_path: null as string | null,
  logic_structure_json: JSON.stringify({ characters: FAKE_CHARACTERS, _stub: true }),
};

export function startStubGeneration(mysteryIdValue: string): void {
  const db = getDb();
  const sequence: Array<{ status: string; delay: number }> = [
    { status: "generating_logic", delay: 1000 },
    { status: "validating", delay: 1500 },
    { status: "writing", delay: 1500 },
    { status: "synthesizing", delay: 1000 },
  ];

  let elapsed = 0;
  for (const step of sequence) {
    elapsed += step.delay;
    setTimeout(() => {
      db.update(mysteries).set({ status: step.status }).where(eq(mysteries.id, mysteryIdValue)).run();
    }, elapsed);
  }
  setTimeout(() => {
    db.update(mysteries)
      .set({
        status: "ready",
        title: FAKE_FINAL.title,
        narrative_text: FAKE_FINAL.narrative_text,
        audio_path: FAKE_FINAL.audio_path,
        logic_structure_json: FAKE_FINAL.logic_structure_json,
        validation_passed: 1,
        validation_attempts: 1,
        ready_at: Math.floor(Date.now() / 1000),
      })
      .where(eq(mysteries.id, mysteryIdValue))
      .run();
    logger.info("stub_generation_complete", { mystery_id: mysteryIdValue });
  }, elapsed + 1000);
}
