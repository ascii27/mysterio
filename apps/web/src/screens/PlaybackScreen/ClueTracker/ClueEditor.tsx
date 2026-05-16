import { useEffect, useState } from "react";
import type { Clue } from "@mysterio/shared";

export function ClueEditor({
  clue,
  onSave,
  onDelete,
}: {
  clue: Clue;
  onSave: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clue.content);

  useEffect(() => {
    if (!editing) setDraft(clue.content);
  }, [clue.content, editing]);

  if (editing) {
    return (
      <div style={{ display: "flex", gap: 6, padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--surface)", background: "var(--bg)", color: "var(--text)", fontSize: 16 }}
        />
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#1a1530", fontWeight: 600, cursor: "pointer" }}
        >Save</button>
        <button
          onClick={() => { setDraft(clue.content); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
        >Cancel</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
      <span style={{ flex: 1 }}>{clue.content}</span>
      <button
        onClick={() => setEditing(true)}
        style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", fontSize: 13, cursor: "pointer" }}
      >Edit</button>
      <button
        onClick={onDelete}
        style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--bad)", fontSize: 13, cursor: "pointer" }}
        aria-label="Delete clue"
      >×</button>
    </div>
  );
}
