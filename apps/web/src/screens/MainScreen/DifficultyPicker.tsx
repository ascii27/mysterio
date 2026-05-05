import { DIFFICULTIES, type DifficultyId } from "@mysterio/shared";

export function DifficultyPicker({
  selected,
  onSelect,
}: {
  selected: DifficultyId;
  onSelect: (id: DifficultyId) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {DIFFICULTIES.map((d) => {
        const active = selected === d.id;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            style={{
              background: active ? "var(--accent-2)" : "var(--surface)",
              color: "var(--text)",
              border: active ? "2px solid var(--accent-2)" : "2px solid transparent",
              borderRadius: "var(--radius)",
              padding: 12,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
