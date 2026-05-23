import { Link } from "react-router-dom";
import type { PublicCharacter } from "../../api/mysteries.js";
import type { SolutionResponse } from "../../api/solutions.js";
import { Button } from "../../components/Button.js";

function badgeFor(s: SolutionResponse["solution"]): { label: string; color: string; icon: string } {
  if (!s) return { label: "?", color: "var(--text-dim)", icon: "?" };
  if (s.gave_up) return { label: "You gave up", color: "var(--text-dim)", icon: "🙈" };
  if (s.is_correct) return { label: "Correct!", color: "var(--good)", icon: "✓" };
  const partial = (s.who_match ? 1 : 0) + (s.how_match ? 1 : 0) + (s.why_match ? 1 : 0);
  if (partial > 0) return { label: "Partly right", color: "var(--accent)", icon: "◐" };
  return { label: "Not quite", color: "var(--bad)", icon: "✗" };
}

export function RevealPanel({ data }: { data: SolutionResponse }) {
  const b = badgeFor(data.solution);
  const culprit = data.characters.find((c: PublicCharacter) => c.id === data.true_solution?.who_did_it);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "var(--surface)", padding: 20, borderRadius: "var(--radius)", textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>{b.icon}</div>
        <h2 style={{ color: b.color, margin: 0 }}>{b.label}</h2>
      </div>
      <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)" }}>
        <h3 style={{ marginTop: 0 }}>The answer</h3>
        <p><b>Who:</b> {culprit?.name ?? data.true_solution?.who_did_it ?? "?"}</p>
        <p><b>How:</b> {data.true_solution?.how ?? "?"}</p>
        <p><b>Why:</b> {data.true_solution?.why ?? "?"}</p>
      </div>
      {data.explanation && (
        <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", lineHeight: 1.6 }}>
          {data.explanation}
        </div>
      )}
      <Link to="/"><Button size="lg" style={{ width: "100%" }}>Back to mysteries</Button></Link>
    </div>
  );
}
