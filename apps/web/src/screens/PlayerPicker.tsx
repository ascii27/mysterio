import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Player } from "@mysterio/shared";
import { deletePlayer, listPlayers } from "../api/players.js";
import { usePlayerStore } from "../state/playerStore.js";
import { Kicker } from "../components/casebook/index.js";
import { CreateDetective } from "./CreateDetective.js";
import { EditDetective } from "./EditDetective.js";

export function PlayerPicker() {
  const setActivePlayer = usePlayerStore((s) => s.setActivePlayer);
  const clear = usePlayerStore((s) => s.clear);
  const activePlayerId = usePlayerStore((s) => s.activePlayerId);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ["players"], queryFn: listPlayers });

  // Stale-id validation: if the stored active player no longer exists, clear it
  useEffect(() => {
    if (data && activePlayerId && !data.players.some((p) => p.id === activePlayerId)) clear();
  }, [data, activePlayerId, clear]);

  const delM = useMutation({
    mutationFn: (id: string) => deletePlayer(id),
    onSuccess: (_d, id) => {
      if (activePlayerId === id) clear();
      void qc.invalidateQueries({ queryKey: ["players"] });
    },
  });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (isError || !data) return <div style={{ padding: 24, color: "var(--bad)" }}>Couldn't load players.</div>;

  if (creating) return <CreateDetective onCancel={() => setCreating(false)} />;
  if (editingPlayer) return <EditDetective player={editingPlayer} onDone={() => setEditingPlayer(null)} />;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>
        <div style={{ fontSize: 50, animation: "floaty 4s ease-in-out infinite" }}>🔎</div>
        <h1 style={{ fontSize: 48, margin: "4px 0 2px" }}>Mysterio</h1>
        <div style={{ color: "var(--accent)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, letterSpacing: "0.12em" }}>
          THE CASEBOOK
        </div>
        <p style={{ color: "var(--text-dim)", margin: "10px 0 24px" }}>Who's on the case today?</p>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <Kicker style={{ marginBottom: 0, textAlign: "left" }}>Detectives</Kicker>
          <button
            type="button"
            onClick={() => setEditing((prev) => !prev)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: editing ? "var(--accent)" : "var(--ink-dim)", padding: 0,
            }}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {data.players.map((p) => (
            // Row is a non-interactive container so the "select" and "delete" actions can be
            // SIBLING buttons. A <button> nested in a <button> is invalid HTML and iOS Safari
            // drops taps on the inner one — which broke delete on iPad.
            <div
              key={p.id}
              style={{
                display: "flex", alignItems: "center",
                background: "var(--surface)", border: "1px solid var(--line)",
                borderRadius: "var(--radius)", boxShadow: "0 2px 0 rgba(0,0,0,0.2)", overflow: "hidden",
              }}
            >
              <button
                type="button"
                aria-label={p.name}
                onClick={() => {
                  if (editing) setEditingPlayer(p);
                  else setActivePlayer(p.id);
                }}
                style={{
                  flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                  background: "none", border: "none", padding: 16, cursor: "pointer",
                  color: "inherit", font: "inherit",
                }}
              >
                <div aria-hidden="true" style={{
                  width: 48, height: 48, borderRadius: 10, flex: "0 0 auto", display: "grid", placeItems: "center",
                  overflow: "hidden",
                  background: "radial-gradient(120% 120% at 30% 25%, var(--accent), var(--accent-dark))",
                  color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 22,
                  border: "3px solid var(--cream)",
                }}>
                  {p.avatar_image_path
                    ? <img src={`/images/${p.avatar_image_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (p.name[0] ?? "?").toUpperCase()}
                </div>
                <span style={{ flex: 1, fontFamily: "var(--display)", fontWeight: 700, fontSize: 22 }}>{p.name}</span>
              </button>
              {editing && (
                <button
                  type="button"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete detective ${p.name}? Their notes and solved mysteries are removed.`)) {
                      delM.mutate(p.id);
                    }
                  }}
                  style={{
                    background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius)",
                    padding: "8px 12px", margin: "0 12px", cursor: "pointer", color: "var(--bad)", fontSize: 18,
                    lineHeight: 1, flexShrink: 0,
                  }}
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            marginTop: 14, width: "100%", padding: 16, textAlign: "left",
            display: "flex", alignItems: "center", gap: 14,
            background: "var(--surface)", border: "1px dashed var(--line)",
            borderRadius: "var(--radius)", cursor: "pointer",
            boxShadow: "0 2px 0 rgba(0,0,0,0.2)",
            fontFamily: "var(--display)", fontWeight: 700, fontSize: 18,
            color: "var(--accent)",
          }}
        >
          <span style={{ fontSize: 22 }}>➕</span> New detective
        </button>
      </div>
    </div>
  );
}
