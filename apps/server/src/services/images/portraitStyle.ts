/** Bump when the portrait art style changes. */
export const PORTRAIT_STYLE_VERSION = "portrait-v1";

const STYLE_PREAMBLE =
  "A friendly storybook character portrait of a small-town resident, head-and-shoulders, in soft " +
  "golden-hour gouache, cozy and rounded, gentle painterly texture, on a simple warm background.";

// Same child-safety clause as cover/avatar generation — kept identical on purpose.
const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

/** Identity-only prompt. Must never reference a character's culprit status in any case (spoiler-safe). */
export function buildPortraitPrompt(description: string): string {
  return [
    STYLE_PREAMBLE,
    `The resident: ${description}`,
    "A single friendly character, centered, looking toward the viewer.",
    SAFETY_CLAUSE,
  ].join(" ");
}
