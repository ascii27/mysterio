import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ClueCategoryType } from "@mysterio/shared";
import { createClue, deleteClue, listClues, updateClue } from "../../../api/clues.js";
import { Button } from "../../../components/Button.js";
import { ClueCategoryTabs } from "./ClueCategoryTabs.js";
import { ClueEditor } from "./ClueEditor.js";

export function ClueTracker({ mysteryId }: { mysteryId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ClueCategoryType>("character");
  const [draft, setDraft] = useState("");

  const cluesQ = useQuery({ queryKey: ["clues", mysteryId], queryFn: () => listClues(mysteryId) });

  const createM = useMutation({
    mutationFn: () => createClue(mysteryId, { category_type: activeTab, content: draft.trim() }),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["clues", mysteryId] }); },
  });
  const updateM = useMutation({
    mutationFn: ({ clueId, content }: { clueId: string; content: string }) => updateClue(mysteryId, clueId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId] }),
  });
  const deleteM = useMutation({
    mutationFn: (clueId: string) => deleteClue(mysteryId, clueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId] }),
  });

  const allClues = cluesQ.data?.clues ?? [];
  const visible = allClues.filter((c) => c.category_type === activeTab);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 20px",
          background: "var(--surface)",
          border: "none",
          borderTop: "2px solid var(--accent)",
          color: "var(--text)",
          fontSize: 15,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          zIndex: 5,
        }}
        aria-label="Open clue tracker"
      >
        <span>
          📝 Clue Tracker{" "}
          <span style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 13 }}>
            — {allClues.length} {allClues.length === 1 ? "clue" : "clues"}
          </span>
        </span>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>▲ Tap to open</span>
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setExpanded(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10 }}
        aria-hidden="true"
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--surface)",
          borderRadius: "16px 16px 0 0",
          padding: 16,
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 11,
        }}
        role="dialog"
        aria-label="Clue tracker"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Clue Tracker</h3>
          <button
            onClick={() => setExpanded(false)}
            style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 24, cursor: "pointer", padding: 4 }}
            aria-label="Close clue tracker"
          >▼</button>
        </div>
        <ClueCategoryTabs active={activeTab} onChange={setActiveTab} />
        <div style={{ display: "grid", gap: 6, overflowY: "auto", flex: 1, marginBottom: 8 }}>
          {visible.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>{emptyCopy(activeTab)}</p>
          )}
          {visible.map((c) => (
            <ClueEditor
              key={c.id}
              clue={c}
              onSave={(content) => updateM.mutate({ clueId: c.id, content })}
              onDelete={() => deleteM.mutate(c.id)}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a clue..."
            style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid var(--surface-2)", background: "var(--bg)", color: "var(--text)", fontSize: 16 }}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim() && !createM.isPending) createM.mutate(); }}
          />
          <Button disabled={!draft.trim() || createM.isPending} onClick={() => createM.mutate()}>Add</Button>
        </div>
      </div>
    </>
  );
}

function emptyCopy(tab: ClueCategoryType): string {
  switch (tab) {
    case "character": return "Heard about a suspicious character? Add them here.";
    case "item": return "Notice an interesting object? Write it down.";
    case "location": return "A surprising place? Add it here.";
    case "event": return "Something that happened that doesn't add up?";
    case "note": return "Anything else you want to remember.";
  }
}
