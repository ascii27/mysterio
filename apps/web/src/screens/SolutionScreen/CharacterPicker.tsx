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
              background: active ? "rgba(192,137,43,0.16)" : "var(--surface)",
              color: "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid var(--line)",
              borderRadius: "var(--radius)",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div aria-hidden="true" style={{
              width: 54, height: 54, margin: "0 auto 6px", borderRadius: 8,
              background: "radial-gradient(120% 120% at 30% 25%, var(--accent), var(--accent-dark))",
              display: "grid", placeItems: "center", color: "#fff",
              fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, border: "3px solid var(--cream)",
              boxShadow: active ? "0 0 0 3px var(--accent)" : "none",
            }}>{(c.name[0] ?? "?").toUpperCase()}</div>
            <div style={{ fontWeight: 700, fontFamily: "var(--display)" }}>{c.name}</div>
          </button>
        );
      })}
    </div>
  );
}
