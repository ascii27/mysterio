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
        <div style={{ fontSize: 56 }}>🌀</div>
        <p style={{ marginTop: 16, marginBottom: 24 }}>{msg}</p>
        <Link to="/"><Button size="lg">Back to mysteries</Button></Link>
      </div>
    </div>
  );
}
