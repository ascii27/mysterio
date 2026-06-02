import { useQuery } from "@tanstack/react-query";
import { listClues } from "../../api/clues.js";
import { CLUE_TABS } from "../PlaybackScreen/ClueTracker/ClueCategoryTabs.js";

export function ClueSummary({ mysteryId }: { mysteryId: string }) {
  const { data } = useQuery({ queryKey: ["clues", mysteryId], queryFn: () => listClues(mysteryId) });
  const clues = data?.clues ?? [];
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 16, borderRadius: "var(--radius)" }}>
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 16 }}>Your clues</h3>
      {clues.length === 0 && (
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13 }}>
          You didn't write any clues. That's OK.
        </p>
      )}
      {CLUE_TABS.map((t) => {
        const list = clues.filter((c) => c.category_type === t.id);
        if (list.length === 0) return null;
        return (
          <div key={t.id} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>{t.label}</div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {list.map((c) => <li key={c.id}>{c.content}</li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
