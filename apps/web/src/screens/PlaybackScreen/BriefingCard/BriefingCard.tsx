import type { PublicCharacter, MysteryDetail } from "../../../api/mysteries.js";
import { Button } from "../../../components/Button.js";

const CATEGORY_EMOJI: Record<string, string> = {
  "missing-pet": "🐾",
  "haunted-mansion": "👻",
  "stolen-treasure": "💎",
  "locked-room": "🔐",
};

const ROLE_BADGE: Record<string, { emoji: string; label: string; color: string }> = {
  detective: { emoji: "🕵️", label: "You", color: "var(--accent)" },
  suspect:   { emoji: "🤔", label: "Suspect", color: "var(--bad)" },
  witness:   { emoji: "👀", label: "Witness", color: "#9ad4ff" },
  bystander: { emoji: "🧍", label: "Bystander", color: "var(--text-dim)" },
};

export function BriefingCard({
  mystery,
  onStart,
}: {
  mystery: MysteryDetail;
  onStart: () => void;
}) {
  const characters: PublicCharacter[] = mystery.characters ?? [];
  const detective = characters.find((c) => c.role === "detective");
  const others = characters.filter((c) => c.role !== "detective");
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
          Your job: figure out <b>who</b> did it, <b>how</b>, and <b>why</b>.
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
              emoji="🕵️"
              label="You"
              labelColor="var(--accent)"
              name={`Detective ${detective.name}`}
            />
          )}
          {others.map((c) => {
            const badge = ROLE_BADGE[c.role] ?? { emoji: "🧍", label: "Bystander", color: "var(--text-dim)" };
            return (
              <CastRow
                key={c.id}
                emoji={badge.emoji}
                label={badge.label}
                labelColor={badge.color}
                name={c.name}
              />
            );
          })}
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
      <span style={{ color: labelColor, fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--text-dim)" }}>—</span>
      <span>{name}</span>
    </div>
  );
}
