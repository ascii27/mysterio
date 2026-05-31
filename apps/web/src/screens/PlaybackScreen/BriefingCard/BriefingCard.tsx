import type { PublicCharacter, MysteryDetail } from "../../../api/mysteries.js";
import { Button } from "../../../components/Button.js";

const CATEGORY_EMOJI: Record<string, string> = {
  "missing-pet": "🐾",
  "haunted-mansion": "👻",
  "stolen-treasure": "💎",
  "locked-room": "🔒",
};

const DETECTIVE_BADGE = { emoji: "🕵️", label: "You", color: "var(--accent)" };
const PERSON_BADGE = { emoji: "🤔", color: "var(--bad)" };

export function BriefingCard({
  mystery,
  onStart,
}: {
  mystery: MysteryDetail;
  onStart: () => void;
}) {
  const characters: PublicCharacter[] = mystery.characters ?? [];
  const detective = characters.find((c) => c.role === "detective");
  const others = characters
    .filter((c) => c.role !== "detective")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const icon = CATEGORY_EMOJI[mystery.category] ?? "🔎";

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          padding: 24,
          border: "2px solid var(--accent)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48 }}>{icon}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-dim)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 8,
          }}
        >
          Today's case
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
          {mystery.title ?? "Untitled Mystery"}
        </div>
        <div style={{ fontSize: 14, color: "var(--text)", margin: "16px 0", lineHeight: 1.5 }}>
          {mystery.central_question ? (
            <><b>Your case:</b> {mystery.central_question}</>
          ) : (
            <>Your job: figure out <b>who</b> did it, <b>how</b>, and <b>why</b>.</>
          )}
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "left",
            margin: "16px 0 6px",
          }}
        >
          You'll meet
        </div>
        <div style={{ display: "grid", gap: 4, textAlign: "left" }}>
          {detective && (
            <CastRow
              emoji={DETECTIVE_BADGE.emoji}
              label={DETECTIVE_BADGE.label}
              labelColor={DETECTIVE_BADGE.color}
              name={`Detective ${detective.name}`}
            />
          )}
          {others.map((c) => (
            <CastRow
              key={c.id}
              emoji={PERSON_BADGE.emoji}
              label=""
              labelColor={PERSON_BADGE.color}
              name={c.name}
            />
          ))}
        </div>

        <Button size="lg" onClick={onStart} style={{ width: "100%", marginTop: 20 }}>
          📖 Start the story
        </Button>
      </div>
    </div>
  );
}

function CastRow({
  emoji, label, labelColor, name,
}: { emoji: string; label: string; labelColor: string; name: string }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 13,
        color: "var(--text)",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span>{emoji}</span>
      {label && <span style={{ color: labelColor, fontWeight: 600 }}>{label}</span>}
      {label && <span style={{ color: "var(--text-dim)" }}>—</span>}
      <span>{name}</span>
    </div>
  );
}
