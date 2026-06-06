import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGE_RANGES, type AgeRange, type DifficultyId } from "@mysterio/shared";
import { createPlayer, updatePlayer, generateAvatar, deletePlayer } from "../api/players.js";
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
  // Set once the detective has been persisted (the avatar endpoint needs a real id).
  // Generating an avatar mid-create therefore creates the row early; Cancel cleans it up.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);

  // Persist the current field values, creating the row the first time and updating it after.
  // Returns the player id. The server reads avatar_description from the saved row, so this
  // must run before any generate call.
  async function persist(): Promise<string> {
    if (createdId) {
      await updatePlayer(createdId, {
        name: name.trim(),
        age_range: ageRange,
        default_difficulty: difficulty,
        avatar_description: avatar.trim(),
      });
      return createdId;
    }
    const res = await createPlayer({
      name: name.trim(),
      age_range: ageRange,
      default_difficulty: difficulty,
      avatar_description: avatar.trim() || undefined,
    });
    return res.player.id;
  }

  // Generate = save the detective, then draw. Stays on this screen.
  const genM = useMutation({
    mutationFn: async () => {
      const id = await persist();
      return generateAvatar(id);
    },
    onSuccess: (res) => {
      setCreatedId(res.player.id);
      setImagePath(res.player.avatar_image_path);
      void qc.invalidateQueries({ queryKey: ["players"] });
    },
  });

  // Start detecting = save any edits (no avatar generation) and switch to the case board.
  const finishM = useMutation({
    mutationFn: () => persist(),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["players"] });
      setActivePlayer(id);
    },
  });

  // If the row was already created (by a Generate), Cancel removes it so we don't leave an orphan.
  const cancelM = useMutation({
    mutationFn: async () => { if (createdId) await deletePlayer(createdId); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["players"] }); onCancel(); },
  });

  const valid = name.trim().length >= 1 && name.trim().length <= 24;
  const hasDescription = avatar.trim().length > 0;
  const busy = genM.isPending || finishM.isPending || cancelM.isPending;
  const canGenerate = valid && hasDescription && !busy;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <Kicker>Create your detective</Kicker>

        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
          <div style={{
            width: 96, height: 96, borderRadius: 16, overflow: "hidden", display: "grid", placeItems: "center",
            background: "radial-gradient(120% 120% at 30% 25%, var(--accent), var(--accent-dark))",
            color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 40, border: "3px solid var(--cream)",
          }}>
            {imagePath
              ? <img src={`/images/${imagePath}`} alt={`${name}'s avatar`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (name.trim()[0] ?? "?").toUpperCase()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => genM.mutate()}
          disabled={!canGenerate}
          style={{
            display: "block", margin: "0 auto 8px", padding: "8px 14px",
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
            cursor: canGenerate ? "pointer" : "not-allowed", opacity: canGenerate ? 1 : 0.6,
            fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          }}
        >
          {genM.isPending ? "Drawing…" : imagePath ? "↻ Regenerate" : "✨ Generate avatar"}
        </button>
        {!canGenerate && !busy && (
          <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12, margin: "0 0 8px" }}>
            {!valid ? "Add a name first." : "Add a description below first."}
          </p>
        )}

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
            onClick={() => cancelM.mutate()}
            disabled={busy}
            style={{
              flex: 1, padding: 14,
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: "var(--radius)", cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => finishM.mutate()}
            disabled={!valid || busy}
            style={{
              flex: 2, padding: 14, fontWeight: 700,
              background: "var(--accent)", color: "#fff",
              border: "1px solid var(--line)", borderRadius: "var(--radius)",
              cursor: valid && !busy ? "pointer" : "not-allowed",
              opacity: valid && !busy ? 1 : 0.6,
            }}
          >
            {finishM.isPending ? "Starting…" : "Start detecting →"}
          </button>
        </div>
      </div>
    </div>
  );
}
