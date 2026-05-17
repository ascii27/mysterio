import type { NarrativeAnnotation } from "@mysterio/shared";
import type { PublicCharacter } from "../../../api/mysteries.js";

const PERSON_ROLE_COLOR: Record<string, string> = {
  suspect: "#ff8c8c",
  witness: "#9ad4ff",
  bystander: "var(--text-dim)",
};

const PERSON_ROLE_BG: Record<string, string> = {
  suspect: "rgba(255,140,140,0.18)",
  witness: "rgba(154,212,255,0.18)",
  bystander: "rgba(185,179,214,0.15)",
};

const CLUE_COLOR = "#f5c84c";
const CLUE_BG = "rgba(245,200,76,0.20)";

export function AnnotatedNarrative({
  text,
  annotations,
  characters,
  onTap,
}: {
  text: string;
  annotations: NarrativeAnnotation[];
  characters: PublicCharacter[];
  onTap: (annotation: NarrativeAnnotation) => void;
}) {
  // Sort by offset so we can splice the text in order.
  const sorted = [...annotations].sort((a, b) => a.offset - b.offset);

  const charById = new Map<string, PublicCharacter>();
  for (const c of characters) charById.set(c.id, c);

  const pieces: React.ReactNode[] = [];
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
        characters={charById}
        onTap={onTap}
      />
    );
    cursor = ann.offset + ann.length;
  }
  if (cursor < text.length) {
    pieces.push(text.slice(cursor));
  }

  return (
    <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 16 }}>
      {pieces}
    </div>
  );
}

function AnnotatedSpan({
  annotation,
  characters,
  onTap,
}: {
  annotation: NarrativeAnnotation;
  characters: Map<string, PublicCharacter>;
  onTap: (a: NarrativeAnnotation) => void;
}) {
  const inner = annotation.text;
  let color = CLUE_COLOR;
  let bg = CLUE_BG;
  let aria = `Clue: ${inner}`;
  if (annotation.type === "person") {
    const c = characters.get(annotation.id);
    const role = c?.role ?? "bystander";
    color = PERSON_ROLE_COLOR[role] ?? PERSON_ROLE_COLOR["bystander"] ?? "var(--text-dim)";
    bg = PERSON_ROLE_BG[role] ?? PERSON_ROLE_BG["bystander"] ?? "rgba(185,179,214,0.15)";
    aria = `${role.charAt(0).toUpperCase() + role.slice(1)}: ${inner}`;
  }
  return (
    <button
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
      }}
    >
      {inner}
    </button>
  );
}
