import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { difficultyConfig } from "@mysterio/shared";
import { listPlayers, listTrophies, type Trophy } from "../../api/players.js";
import { usePlayerStore } from "../../state/playerStore.js";
import { RankBadge, Chip } from "../../components/casebook/index.js";

function solvedDate(ms: number): string {
  return new Date(ms * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function TrophyRoom() {
  const navigate = useNavigate();
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const [open, setOpen] = useState<Trophy | null>(null);

  const { data: playersData } = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const player = playersData?.players.find((p) => p.id === playerId);
  const { data, isLoading } = useQuery({ queryKey: ["trophies", playerId], queryFn: () => listTrophies(playerId) });

  const trophies = data?.trophies ?? [];
  const rep = player?.reputation;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 26 }}>Trophy Room</h1>
      </header>

      <div style={{ display: "flex", gap: 14, alignItems: "center", background: "linear-gradient(135deg,#f3ead0,#e7d6ac)", borderRadius: "var(--radius-lg)", padding: 18, border: "1px solid var(--line)", boxShadow: "inset 4px 0 0 var(--gold)", marginBottom: 20 }}>
        <RankBadge rankIndex={rep?.rank_index ?? 0} size={64} />
        <div>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22 }}>{trophies.length} solved</div>
          <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>{rep?.rank_name ?? "Rookie"} · Detective {player?.name ?? ""}</div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 24, color: "var(--text-dim)" }}>Loading…</div>
      ) : trophies.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "var(--text-dim)" }}>
          <div style={{ fontSize: 46 }}>🏆</div>
          <p>Your shelf is waiting. Solve your first case to earn a trophy!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {trophies.map((t) => (
            <button
              key={t.mystery_id}
              type="button"
              onClick={() => setOpen(t)}
              style={{ textAlign: "left", padding: 0, borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface)", border: "2px solid var(--gold)", boxShadow: "0 8px 20px -10px rgba(232,176,75,0.5)", cursor: "pointer" }}
            >
              <div style={{ position: "relative", height: 88, background: "var(--surface-2)" }}>
                {t.cover_image_path && (
                  <img src={`/images/${t.cover_image_path}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
                <div style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", background: "var(--good)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>✓</div>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>{t.title ?? "Untitled case"}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 5 }}>⭐ Solved · {solvedDate(t.solved_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <TrophyDetail trophy={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TrophyDetail({ trophy, onClose }: { trophy: Trophy; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(8,5,16,0.6)" }} />
      <div style={{ position: "relative", background: "var(--bg)", borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "85%", overflowY: "auto", padding: 22, boxShadow: "0 -20px 40px -20px rgba(0,0,0,0.8)" }}>
        <button type="button" onClick={onClose} style={{ position: "absolute", top: 12, right: 14, width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer", fontSize: 16 }}>✕</button>
        {trophy.cover_image_path && (
          <img src={`/images/${trophy.cover_image_path}`} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: "var(--radius)", marginBottom: 14 }} />
        )}
        <h2 style={{ fontSize: 24, margin: "0 0 8px" }}>{trophy.title ?? "Untitled case"}</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Chip tone="good">✓ Solved · {solvedDate(trophy.solved_at)}</Chip>
          <Chip tone="ink">{difficultyConfig(trophy.difficulty).name}</Chip>
        </div>
        {trophy.culprit_name && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 800, textTransform: "uppercase", fontFamily: "var(--display)" }}>The culprit</div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 19 }}>{trophy.culprit_name}</div>
          </div>
        )}
        {trophy.how && <p style={{ color: "var(--ink-dim)", fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{trophy.how}</p>}
      </div>
    </div>
  );
}
