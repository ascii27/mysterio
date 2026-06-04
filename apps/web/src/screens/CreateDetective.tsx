import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGE_RANGES, type AgeRange, type DifficultyId } from "@mysterio/shared";
import { createPlayer } from "../api/players.js";
import { usePlayerStore } from "../state/playerStore.js";
import { Kicker } from "../components/casebook/index.js";

const DIFFICULTIES: DifficultyId[] = ["easy", "medium", "hard"];

export function CreateDetective({ onCancel }: { onCancel: () => void }) {
  const setActivePlayer = usePlayerStore((s) => s.setActivePlayer);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState<AgeRange>("10-11");
  const [difficulty, setDifficulty] = useState<DifficultyId>("easy");
  const [avatar, setAvatar] = useState("");

  const createM = useMutation({
    mutationFn: () => createPlayer({
      name: name.trim(),
      age_range: ageRange,
      default_difficulty: difficulty,
      avatar_description: avatar.trim() || undefined,
    }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["players"] });
      setActivePlayer(res.player.id);
    },
  });

  const valid = name.trim().length >= 1 && name.trim().length <= 24;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <Kicker>Create your detective</Kicker>

        <label style={{ display: "block", margin: "12px 0 4px" }}>Name</label>
        <input
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lily"
          style={{
            width: "100%", padding: 12, boxSizing: "border-box",
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--radius)", color: "inherit", fontFamily: "inherit", fontSize: 16,
          }}
        />

        <label style={{ display: "block", margin: "16px 0 4px" }}>Age</label>
        <div style={{ display: "flex", gap: 8 }}>
          {AGE_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setAgeRange(r)}
              aria-pressed={ageRange === r}
              style={{
                flex: 1, padding: 12, fontWeight: ageRange === r ? 700 : 400,
                background: ageRange === r ? "var(--accent)" : "var(--surface)",
                color: ageRange === r ? "#fff" : "inherit",
                border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer",
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <label style={{ display: "block", margin: "16px 0 4px" }}>Difficulty</label>
        <div style={{ display: "flex", gap: 8 }}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              aria-pressed={difficulty === d}
              style={{
                flex: 1, padding: 12, textTransform: "capitalize",
                fontWeight: difficulty === d ? 700 : 400,
                background: difficulty === d ? "var(--accent)" : "var(--surface)",
                color: difficulty === d ? "#fff" : "inherit",
                border: "1px solid var(--line)", borderRadius: "var(--radius)", cursor: "pointer",
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <label style={{ display: "block", margin: "16px 0 4px" }}>
          Describe your detective (optional)
        </label>
        <textarea
          value={avatar}
          maxLength={300}
          onChange={(e) => setAvatar(e.target.value)}
          rows={3}
          placeholder="e.g. a kid with curly red hair, a green coat, and a magnifying glass"
          style={{
            width: "100%", padding: 12, boxSizing: "border-box",
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--radius)", color: "inherit", fontFamily: "inherit",
            fontSize: 15, resize: "vertical",
          }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: 14,
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: "var(--radius)", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createM.mutate()}
            disabled={!valid || createM.isPending}
            style={{
              flex: 2, padding: 14, fontWeight: 700,
              background: "var(--accent)", color: "#fff",
              border: "1px solid var(--line)", borderRadius: "var(--radius)",
              cursor: valid && !createM.isPending ? "pointer" : "not-allowed",
              opacity: valid && !createM.isPending ? 1 : 0.6,
            }}
          >
            {createM.isPending ? "Creating..." : "Start detecting →"}
          </button>
        </div>
      </div>
    </div>
  );
}
