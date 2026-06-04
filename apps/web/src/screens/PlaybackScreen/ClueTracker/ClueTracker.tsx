import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ClueCategoryType } from "@mysterio/shared";
import { createClue, deleteClue, listClues, updateClue } from "../../../api/clues.js";
import { Button } from "../../../components/Button.js";
import { usePlayerStore } from "../../../state/playerStore.js";
import { ClueCategoryTabs } from "./ClueCategoryTabs.js";
import { ClueEditor } from "./ClueEditor.js";

export function ClueTracker({
  mysteryId,
  focusedClueId,
  onClearFocus,
}: {
  mysteryId: string;
  focusedClueId?: string | null;
  onClearFocus?: () => void;
}) {
  const qc = useQueryClient();
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ClueCategoryType>("character");
  const [draft, setDraft] = useState("");
  const focusedRowRef = useRef<HTMLDivElement | null>(null);

  const cluesQ = useQuery({ queryKey: ["clues", mysteryId, playerId], queryFn: () => listClues(mysteryId, playerId) });

  const allClues = cluesQ.data?.clues ?? [];

  // When focusedClueId changes OR fresh clue data arrives, expand the drawer
  // and switch to the focused clue's tab.
  useEffect(() => {
    if (!focusedClueId) return;
    const clue = allClues.find((c) => c.id === focusedClueId);
    if (clue) {
      setExpanded(true);
      setActiveTab(clue.category_type);
    }
  }, [focusedClueId, cluesQ.dataUpdatedAt]);

  // Scroll the focused row into view once the tab matches.
  useEffect(() => {
    if (focusedClueId && expanded && focusedRowRef.current) {
      focusedRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedClueId, expanded, activeTab]);

  const createM = useMutation({
    mutationFn: () => createClue(mysteryId, playerId, { category_type: activeTab, content: draft.trim() }),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["clues", mysteryId, playerId] }); },
  });
  const updateM = useMutation({
    mutationFn: ({ clueId, content }: { clueId: string; content: string }) => updateClue(mysteryId, playerId, clueId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId, playerId] }),
  });
  const deleteM = useMutation({
    mutationFn: (clueId: string) => deleteClue(mysteryId, playerId, clueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId, playerId] }),
  });

  const visible = allClues.filter((c) => c.category_type === activeTab);

  function closeDrawer() {
    setExpanded(false);
    if (onClearFocus) onClearFocus();
  }

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
          boxShadow: "0 -6px 16px -8px rgba(40,28,12,0.4)",
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
          🗒️ Clue Notebook{" "}
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
        onClick={closeDrawer}
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
          border: "1px solid var(--line)",
          borderRadius: "16px 16px 0 0",
          padding: 16,
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 11,
          boxShadow: "0 -20px 40px -20px rgba(0,0,0,0.5)",
        }}
        role="dialog"
        aria-label="Clue tracker"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Clue Notebook</h3>
          <button
            onClick={closeDrawer}
            style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 24, cursor: "pointer", padding: 4 }}
            aria-label="Close clue tracker"
          >▼</button>
        </div>
        <ClueCategoryTabs active={activeTab} onChange={setActiveTab} />
        <div style={{ display: "grid", gap: 6, overflowY: "auto", flex: 1, marginBottom: 8 }}>
          {visible.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>{emptyCopy(activeTab)}</p>
          )}
          {visible.map((c) => {
            const isFocused = c.id === focusedClueId;
            return (
              <div key={c.id} ref={isFocused ? focusedRowRef : undefined}>
                <ClueEditor
                  clue={c}
                  focused={isFocused}
                  onSave={(content) => updateM.mutate({ clueId: c.id, content })}
                  onDelete={() => deleteM.mutate(c.id)}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a clue..."
            style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text)", fontSize: 16, fontFamily: "var(--hand)" }}
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
