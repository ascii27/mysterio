import { Link } from "react-router-dom";
import { Button } from "../../components/Button.js";

const FRIENDLY: Record<string, string> = {
  validation_exhausted: "Couldn't write a fair mystery this time. Want to try a different category?",
  readthrough_exhausted: "Couldn't write a mystery that's fair to solve this time. Want to try a different category?",
  narrative_clue_coverage: "The story didn't include all the clues. Try again — sometimes it just needs another go.",
  tts_error: "Couldn't record the narration. Try again in a minute?",
  server_restart: "The server restarted while this was being made. Just start a new one.",
};

export function FailedMystery({ reason }: { reason: string | null }) {
  const msg = (reason && FRIENDLY[reason]) ?? "Something went wrong. Try a new mystery?";
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 56 }}>🗂️</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 20, margin: "16px 0 24px", boxShadow: "0 2px 0 rgba(0,0,0,0.15)" }}>
          {msg}
        </div>
        <Link to="/"><Button size="lg">Back to the casebook</Button></Link>
      </div>
    </div>
  );
}
