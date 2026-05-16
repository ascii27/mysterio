import type { PublicCharacter } from "../../api/mysteries.js";

const ROLE_EMOJI: Record<string, string> = {
  detective: "🕵️",
  suspect: "🤔",
  witness: "👀",
  bystander: "🧍",
};

export function CharacterPicker({
  characters,
  selected,
  onSelect,
}: {
  characters: PublicCharacter[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  // The detective is the listener's stand-in — don't show them as a guess option.
  const suspects = characters.filter((c) => c.role !== "detective");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
      {suspects.map((c) => {
        const active = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              padding: 12,
              background: active ? "var(--accent)" : "var(--surface-2)",
              color: active ? "#1a1530" : "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "var(--radius)",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 32 }}>{ROLE_EMOJI[c.role] ?? "🧍"}</div>
            <div style={{ fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{c.role}</div>
          </button>
        );
      })}
    </div>
  );
}
