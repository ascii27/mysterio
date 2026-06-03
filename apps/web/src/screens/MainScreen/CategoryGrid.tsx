import { CATEGORIES, type CategoryId } from "@mysterio/shared";
import { SceneArt, SCENE_FOR_CATEGORY } from "../../components/casebook/index.js";

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
              textAlign: "left", padding: 0, overflow: "hidden", cursor: "pointer",
              background: "var(--surface)", borderRadius: "var(--radius)",
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              transform: active ? "translateY(-2px)" : "none", transition: "transform .12s",
              boxShadow: active ? "0 12px 24px -12px rgba(192,137,43,0.6)" : "0 2px 0 rgba(0,0,0,0.2)",
            }}
          >
            <SceneArt scene={SCENE_FOR_CATEGORY[c.id] ?? "generic"} height={84} radius={0} />
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "var(--display)" }}>{ICONS[c.id]} {c.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.35 }}>{c.blurb}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
