import { useEffect, useState, type CSSProperties } from "react";
import type { Clue } from "@mysterio/shared";

export function ClueEditor({
  clue,
  focused,
  onSave,
  onDelete,
}: {
  clue: Clue;
  focused?: boolean;
  onSave: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clue.content);

  useEffect(() => {
    if (!editing) setDraft(clue.content);
  }, [clue.content, editing]);

  const isAuto = clue.source === "annotation";

  const wrapperStyle: CSSProperties = {
    display: "flex",
    gap: 6,
    alignItems: "center",
    padding: 8,
    background: "var(--surface-2)",
    borderRadius: 8,
    border: focused ? "2px solid var(--accent)" : "2px solid transparent",
    transition: "border-color 120ms ease",
    fontSize: 16,
  };

  if (editing) {
    return (
      <div style={wrapperStyle}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", fontSize: 16, fontFamily: "var(--hand)" }}
        />
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#33240c", fontWeight: 600, cursor: "pointer" }}
        >Save</button>
        <button
          onClick={() => { setDraft(clue.content); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
        >Cancel</button>
      </div>
    );
  }
  return (
    <div style={wrapperStyle}>
      {isAuto && (
        <span
          title="Added by tapping a highlight in the story"
          style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}
        >✨</span>
      )}
      <span style={{ flex: 1, fontFamily: "var(--hand)" }}>{clue.content}</span>
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
