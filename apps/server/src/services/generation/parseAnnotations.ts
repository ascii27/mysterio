import type { LogicStructure, NarrativeAnnotation } from "@mysterio/shared";
import { logger } from "../../utils/logger.js";

const TAG_RE = /\[(p|c):([^\]\s]+)\]([\s\S]+?)\[\/\1\]/g;

export function parseNarrativeAnnotations(
  rawWithTags: string,
  ls: LogicStructure,
): { text: string; annotations: NarrativeAnnotation[] } {
  // Pre-compute id lookups
  const characterIds = new Set(ls.characters.filter((c) => c.role !== "detective").map((c) => c.id));
  const clueIds = new Set(ls.essential_clues.map((c) => c.id));

  // Walk the input once, building the clean text + annotations.
  const annotations: NarrativeAnnotation[] = [];
  const cleanParts: string[] = [];
  let cleanLen = 0;
  let cursor = 0;

  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(rawWithTags); m !== null; m = TAG_RE.exec(rawWithTags)) {
    const matched = m[0];
    const kind = m[1] ?? "";
    const id = m[2] ?? "";
    const inner = m[3] ?? "";
    const matchStart = m.index;

    // Copy the text between cursor and matchStart verbatim.
    if (matchStart > cursor) {
      const segment = rawWithTags.slice(cursor, matchStart);
      cleanParts.push(segment);
      cleanLen += segment.length;
    }

    // Decide whether to keep the annotation or drop the tag (always keep inner text).
    const type: "person" | "clue" = kind === "p" ? "person" : "clue";
    const valid =
      (type === "person" && characterIds.has(id)) ||
      (type === "clue" && clueIds.has(id));

    if (valid) {
      annotations.push({ type, id, offset: cleanLen, length: inner.length, text: inner });
    } else {
      logger.info("parse_annotations_dropped_tag", { type, id, reason: "id_not_in_logic_structure" });
    }

    // Always emit the inner text into the clean output.
    cleanParts.push(inner);
    cleanLen += inner.length;
    cursor = matchStart + matched.length;
  }

  // Tail: anything after the last match.
  if (cursor < rawWithTags.length) {
    cleanParts.push(rawWithTags.slice(cursor));
  }

  return { text: cleanParts.join(""), annotations };
}
