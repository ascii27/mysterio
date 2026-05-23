import { CATEGORIES, type CategoryId } from "@mysterio/shared";

const ICONS: Record<CategoryId, string> = {
  "missing-pet": "🐾",
  "haunted-mansion": "👻",
  "stolen-treasure": "💎",
  "locked-room": "🔒",
};

export function CategoryGrid({
  selected,
  onSelect,
}: {
  selected: CategoryId | null;
  onSelect: (id: CategoryId) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {CATEGORIES.map((c) => {
        const active = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              background: active ? "var(--accent)" : "var(--surface)",
              color: active ? "#1a1530" : "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "var(--radius)",
              padding: 16,
              textAlign: "left",
              cursor: "pointer",
              minHeight: 120,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 4 }}>{ICONS[c.id]}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{c.blurb}</div>
          </button>
        );
      })}
    </div>
  );
}
