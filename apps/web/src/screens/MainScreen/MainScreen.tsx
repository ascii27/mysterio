import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type CategoryId, type DifficultyId, difficultyConfig } from "@mysterio/shared";
import { generateMystery } from "../../api/mysteries.js";
import { listPlayers } from "../../api/players.js";
import { Button } from "../../components/Button.js";
import { usePlayerStore } from "../../state/playerStore.js";
import { CategoryGrid } from "./CategoryGrid.js";
import { DifficultyPicker } from "./DifficultyPicker.js";
import { RecentList } from "./RecentList.js";
import { Kicker } from "../../components/casebook/index.js";

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

      <div
        style={{
          background: "linear-gradient(135deg, #f3ead0, #e7d6ac)",
          padding: 18,
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--line)",
          boxShadow: "0 2px 8px -3px rgba(40,28,12,0.3), inset 4px 0 0 var(--accent)",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--display)", fontWeight: 700 }}>
          Welcome back
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, fontFamily: "var(--display)" }}>
          Detective {player?.name ?? ""} 🕵️
        </div>
      </div>

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
