export const PLACE_STYLE_VERSION = "place-v1";

const STYLE_PREAMBLE =
  "A warm storybook illustration of a cozy small-town location, soft golden-hour gouache, " +
  "rounded and inviting, gentle painterly texture, no people in frame.";

const SAFETY_CLAUSE =
  "Child-friendly and age-appropriate for ages 8-13, non-violent, not scary, " +
  "no gore, no weapons. No text, no words, no letters, and no numbers anywhere in the image.";

export function buildPlaceImagePrompt(name: string, description: string): string {
  return [
    STYLE_PREAMBLE,
    `The place: ${name}. ${description}`,
    "Show the building or setting and its mood, establishing-shot framing.",
    SAFETY_CLAUSE,
  ].join(" ");
}
