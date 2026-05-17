import type { PublicCharacter } from "../../api/mysteries.js";

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
            type="button"
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
            <div style={{ fontSize: 32 }}>🤔</div>
            <div style={{ fontWeight: 700 }}>{c.name}</div>
          </button>
        );
      })}
    </div>
  );
}
