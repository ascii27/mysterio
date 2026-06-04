import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listHints, requestHint } from "../../api/hints.js";
import { giveUp } from "../../api/solutions.js";
import { Button } from "../../components/Button.js";
import { usePlayerStore } from "../../state/playerStore.js";

export function HintControls({ mysteryId, onGaveUp }: { mysteryId: string; onGaveUp: () => void }) {
  const qc = useQueryClient();
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const hintsQ = useQuery({ queryKey: ["hints", mysteryId, playerId], queryFn: () => listHints(mysteryId, playerId) });
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  const askHint = useMutation({
    mutationFn: () => requestHint(mysteryId, playerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hints", mysteryId, playerId] }),
  });

  const giveUpM = useMutation({
    mutationFn: () => giveUp(mysteryId, playerId),
    onSuccess: () => onGaveUp(),
  });

  const remaining = hintsQ.data?.remaining ?? 2;
  const hintList = hintsQ.data?.hints ?? [];

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 16, borderRadius: "var(--radius)" }}>
      <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Need a hint?</h3>
      {hintList.length > 0 && (
        <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
          {hintList.map((h) => <li key={h.id} style={{ marginBottom: 4 }}>{h.content}</li>)}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button
          variant="cream"
          disabled={remaining === 0 || askHint.isPending}
          onClick={() => askHint.mutate()}
        >
          {askHint.isPending ? "Thinking..." : (remaining === 0 ? "All hints used" : `Give me a clue (${remaining} left)`)}
        </Button>
        {!confirmGiveUp ? (
          <Button variant="ghost" onClick={() => setConfirmGiveUp(true)}>I give up — tell me</Button>
        ) : (
          <>
            <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Sure? This will reveal the answer.</span>
            <Button variant="secondary" disabled={giveUpM.isPending} onClick={() => giveUpM.mutate()}>
              {giveUpM.isPending ? "Revealing..." : "Yes, reveal"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmGiveUp(false)}>Keep trying</Button>
          </>
        )}
      </div>
    </div>
  );
}
