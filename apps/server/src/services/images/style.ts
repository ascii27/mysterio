import type { CategoryId } from "@mysterio/shared";

/** Bump when the shared art style changes; existing covers are immutable. */
export const STYLE_VERSION = "casebook-v1";

/** Spoiler-safe inputs only — never pass solution/culprit data here. */
export interface CoverPromptInput {
  category: CategoryId;
  title: string;
  centralQuestion: string;
  setting: string;
}

const STYLE_PREAMBLE =
  "A warm storybook detective illustration in soft golden-hour gouache, " +
  "cozy and rounded, gentle painterly texture, inviting and friendly.";

const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

const CATEGORY_MOOD: Record<CategoryId, string> = {
  "missing-pet": "a gentle search for a missing pet around a neighborhood",
  "haunted-mansion": "a friendly-spooky old mansion at dusk, cozy not frightening",
  "stolen-treasure": "a curious case of something precious gone missing",
  "locked-room": "a puzzling locked-room scene with a single way in",
};

export function buildCoverPrompt(input: CoverPromptInput): string {
  return [
    STYLE_PREAMBLE,
    `Scene: ${CATEGORY_MOOD[input.category]}.`,
    `Setting: ${input.setting}`,
    `It illustrates the mystery "${input.title}". ${input.centralQuestion}`,
    "Show the place and mood, not the answer — do not reveal who did it.",
    SAFETY_CLAUSE,
  ].join(" ");
}
