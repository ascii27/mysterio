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
            padding: "6px 12px",
            borderRadius: "8px 8px 4px 4px",
            border: "none",
            background: active === t.id ? "var(--accent)" : "var(--surface-2)",
            color: active === t.id ? "#33240c" : "var(--text-dim)",
            fontSize: 11.5,
            fontWeight: 700,
            fontFamily: "var(--mono)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
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
