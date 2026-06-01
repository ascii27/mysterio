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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Mysterio</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <button
            onClick={clearPlayer}
            style={{ background: "transparent", color: "var(--text-dim)", fontSize: 14 }}
          >
            {player?.name ?? "?"} · Switch player
          </button>
          <Link to="/settings" aria-label="Settings" style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 18 }}>
            ⚙️
          </Link>
        </div>
      </header>

      <div
        style={{
          background: "var(--surface)",
          padding: 16,
          borderRadius: "var(--radius)",
          borderLeft: "3px solid var(--accent)",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Welcome back
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
          Detective {player?.name ?? ""} 🕵️
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Pick a mystery</h2>
        <CategoryGrid selected={category} onSelect={setCategory} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Pick a difficulty</h2>
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
        {generate.isPending ? "Starting..." : "Start Mystery"}
      </Button>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent</h2>
        <RecentList playerId={playerId} />
      </section>
    </div>
  );
}
