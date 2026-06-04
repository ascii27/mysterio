/** Bump when the avatar art style changes. */
export const AVATAR_STYLE_VERSION = "avatar-v1";

const STYLE_PREAMBLE =
  "A friendly storybook character portrait, head-and-shoulders, in soft golden-hour gouache, " +
  "cozy and rounded, gentle painterly texture, on a simple warm background.";

// Same child-safety clause as cover generation (style.ts) — kept identical on purpose.
const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

export function buildAvatarPrompt(description: string): string {
  return [
    STYLE_PREAMBLE,
    `The character: ${description}`,
    "A single friendly character, centered, looking toward the viewer.",
    SAFETY_CLAUSE,
  ].join(" ");
}
