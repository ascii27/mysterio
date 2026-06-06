import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type CategoryId, type DifficultyId, difficultyConfig, RANKS } from "@mysterio/shared";
import { generateMystery } from "../../api/mysteries.js";
import { listPlayers } from "../../api/players.js";
import { Button } from "../../components/Button.js";
import { usePlayerStore } from "../../state/playerStore.js";
import { CategoryGrid } from "./CategoryGrid.js";
import { DifficultyPicker } from "./DifficultyPicker.js";
import { RecentList } from "./RecentList.js";
import { Kicker, RankBadge } from "../../components/casebook/index.js";

function RANKS_NEXT_NAME(rankIndex: number): string {
  return RANKS[rankIndex + 1]?.name ?? "Master Detective";
}

export function MainScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const clearPlayer = usePlayerStore((s) => s.clear);

  const { data: playersData } = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const player = playersData?.players.find((p) => p.id === playerId);

  const [category, setCategory] = useState<CategoryId | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>(player?.default_difficulty ?? "easy");

  const generate = useMutation({
    mutationFn: () => generateMystery({ player_id: playerId, category: category!, difficulty }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["mysteries", playerId] });
      navigate(`/mysteries/${res.mystery_id}`);
    },
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>Mysterio</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={clearPlayer}
            style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", borderRadius: 8, padding: "8px 12px", color: "var(--text-dim)", fontSize: 13, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}
          >
            {player?.name ?? "?"} · Switch
          </button>
          <Link to="/settings" aria-label="Settings" title="Grown-up settings" style={{ width: 38, height: 38, borderRadius: 8, background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", display: "grid", placeItems: "center", textDecoration: "none", fontSize: 18 }}>
            🔧
          </Link>
        </div>
      </header>

      {(() => {
        const rep = player?.reputation;
        const rankIndex = rep?.rank_index ?? 0;
        const rankName = rep?.rank_name ?? "Rookie";
        const pct = Math.round((rep?.progress_fraction ?? 0) * 100);
        return (
          <div
            style={{
              background: "linear-gradient(135deg, #f3ead0, #e7d6ac)",
              padding: 18, borderRadius: "var(--radius-lg)", border: "1px solid var(--line)",
              boxShadow: "0 2px 8px -3px rgba(40,28,12,0.3), inset 4px 0 0 var(--accent)",
              marginBottom: 24, display: "flex", gap: 14, alignItems: "center",
            }}
          >
            <RankBadge rankIndex={rankIndex} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--display)", fontWeight: 700 }}>
                {rankName}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, fontFamily: "var(--display)" }}>
                Detective {player?.name ?? ""} 🕵️
              </div>
              <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(74,52,24,0.18)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--gold)", transition: "width .3s" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 5 }}>
                {rep?.points_to_next != null
                  ? `${rep.points_to_next} more to ${RANKS_NEXT_NAME(rankIndex)} · ${rep.solved_count ?? 0} solved`
                  : `Top rank! · ${rep?.solved_count ?? 0} solved`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/trophies")}
              style={{ flex: "0 0 auto", padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--surface)", border: "1px solid var(--line)", cursor: "pointer", fontFamily: "var(--display)", fontWeight: 700, fontSize: 13 }}
            >
              🏆<br />Trophies
            </button>
          </div>
        );
      })()}

      <section style={{ marginBottom: 24 }}>
        <Kicker>Pick a kind of mystery</Kicker>
        <CategoryGrid selected={category} onSelect={setCategory} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <Kicker>How tricky?</Kicker>
        <DifficultyPicker selected={difficulty} onSelect={setDifficulty} />
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>
          {difficultyConfig(difficulty).essentialClues} essential clues · target ~{difficultyConfig(difficulty).targetWords} words
        </p>
      </section>

      <Button
        size="lg"
        disabled={!category || generate.isPending}
        onClick={() => generate.mutate()}
        style={{ width: "100%" }}
      >
        {generate.isPending ? "Crafting…" : "🔍 Start the Case"}
      </Button>

      <section style={{ marginTop: 32 }}>
        <Kicker>Recent case files</Kicker>
        <RecentList playerId={playerId} />
      </section>
    </div>
  );
}
