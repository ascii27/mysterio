// Mystery-writing craft guidance distilled for the generation prompts.
// Sources:
//   - Agatha Christie's mystery-writing principles (careerauthors.com/christie-tips-on-mystery-writing/)
//     NOTE: that page was HTTP-403 at authoring time; this is distilled from well-established,
//     widely-documented Christie advice, not copied from the live page.
//   - Clay Stafford, "23 Checklist Items to Write a Great Mystery"
//     (claystafford.com/2024/06/20/23-checklist-items-to-write-a-great-mystery/)

/** Injected into the logic-structure (puzzle-design) prompt. */
export const PUZZLE_CRAFT = `MYSTERY CRAFT — PUZZLE DESIGN (Christie + Stafford):
- Fair play above all: the reader must be able to solve it from the clues you provide. Never withhold a clue the solution depends on, and never require off-page knowledge.
- Every essential clue must be present and decisive: each one moves the deduction forward, and together they are SUFFICIENT to determine who, how, and why. If a careful kid could not reach the answer from the essential clues alone, the puzzle is broken.
- Hide clues in plain sight: plant the decisive detail inside ordinary description, not flagged as important.
- The obvious suspect is usually a red herring: let the most suspicious-seeming character be innocent, and misdirect fairly.
- Give multiple viable suspects: more than one character should have a plausible reason to be suspected.
- Ground the motive: the culprit's "why" must be understandable and seeded by their own description.`;

/** Injected into the narrative (prose) prompt. */
export const PROSE_CRAFT = `MYSTERY CRAFT — PROSE (Christie + Stafford):
- Steady drip of clues: distribute the clues (real and red-herring) across the story rather than dumping them in one place.
- Foreshadow fairly: plant what the ending needs so the answer feels surprising yet fair once the listener looks back.
- Distinct atmosphere: let the setting's mood do work; make the place feel almost like a character.
- Active reader engagement: invite the listener to notice and deduce (an occasional direct question), but never solve it for them.
- Believable dialogue and a build: convey information through natural talk and observation; escalate from simple noticing to the harder puzzle.`;
