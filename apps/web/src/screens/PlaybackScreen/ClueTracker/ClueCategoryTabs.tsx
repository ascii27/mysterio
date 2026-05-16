import type { ClueCategoryType } from "@mysterio/shared";

export const CLUE_TABS: { id: ClueCategoryType; label: string }[] = [
  { id: "character", label: "Characters" },
  { id: "item", label: "Items" },
  { id: "location", label: "Locations" },
  { id: "event", label: "Events" },
  { id: "note", label: "Notes" },
];

export function ClueCategoryTabs({
  active,
  onChange,
}: { active: ClueCategoryType; onChange: (t: ClueCategoryType) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4, marginBottom: 8 }}>
      {CLUE_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "none",
            background: active === t.id ? "var(--accent)" : "var(--surface-2)",
            color: active === t.id ? "#1a1530" : "var(--text)",
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
