import { type ReactNode } from "react";
import type { NarrativeAnnotation } from "@mysterio/shared";

const PERSON_COLOR = "var(--teal)";
const PERSON_BG = "rgba(47,125,107,0.16)";

const CLUE_COLOR = "var(--accent)";
const CLUE_BG = "rgba(192,137,43,0.18)";

export function AnnotatedNarrative({
  text,
  annotations,
  onTap,
}: {
  text: string;
  annotations: NarrativeAnnotation[];
  onTap: (annotation: NarrativeAnnotation) => void;
}) {
  // Sort by offset so we can splice the text in order.
  const sorted = [...annotations].sort((a, b) => a.offset - b.offset);

  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const ann of sorted) {
    // Skip annotations that would overlap with the previous one — defense against parser oddities.
    if (ann.offset < cursor) continue;
    // Plain text between cursor and this annotation
    if (ann.offset > cursor) {
      pieces.push(text.slice(cursor, ann.offset));
    }
    pieces.push(
      <AnnotatedSpan
        key={`${ann.type}-${ann.id}-${ann.offset}`}
        annotation={ann}
        onTap={onTap}
      />
    );
    cursor = ann.offset + ann.length;
  }
  if (cursor < text.length) {
    pieces.push(text.slice(cursor));
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--line)", padding: "16px 18px",
      borderRadius: "var(--radius)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 16.5,
      color: "var(--ink)", boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
    }}>
      {pieces}
    </div>
  );
}

function AnnotatedSpan({
  annotation,
  onTap,
}: {
  annotation: NarrativeAnnotation;
  onTap: (a: NarrativeAnnotation) => void;
}) {
  const inner = annotation.text;
  let color = CLUE_COLOR;
  let bg = CLUE_BG;
  let aria = `Clue: ${inner}`;
  if (annotation.type === "person") {
    color = PERSON_COLOR;
    bg = PERSON_BG;
    aria = `Person: ${inner}`;
  }
  return (
    <button
      type="button"
      onClick={() => onTap(annotation)}
      aria-label={aria}
      style={{
        background: bg,
        color,
        padding: "1px 8px",
        borderRadius: 10,
        border: "none",
        font: "inherit",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline",
        // Browsers default <button> to text-align:center; without this, a long
        // multi-line clue highlight renders centered. Keep highlighted clues
        // left-aligned to match the surrounding prose.
        textAlign: "left",
      }}
    >
      {inner}
    </button>
  );
}
