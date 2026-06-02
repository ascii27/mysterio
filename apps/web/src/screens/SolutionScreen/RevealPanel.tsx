import { Link } from "react-router-dom";
import type { PublicCharacter } from "../../api/mysteries.js";
import type { SolutionResponse } from "../../api/solutions.js";
import { Button } from "../../components/Button.js";
import { Stamp } from "../../components/casebook/index.js";

function badgeFor(s: SolutionResponse["solution"]): { label: string; color: string; icon: string } {
  if (!s) return { label: "?", color: "var(--text-dim)", icon: "?" };
  if (s.gave_up) return { label: "You gave up", color: "var(--text-dim)", icon: "🙈" };
  if (s.is_correct) return { label: "Case Solved!", color: "var(--gold)", icon: "🎉" };
  const partial = (s.who_match ? 1 : 0) + (s.how_match ? 1 : 0) + (s.why_match ? 1 : 0);
  if (partial > 0) return { label: "Partly right", color: "var(--accent)", icon: "◐" };
  return { label: "Not quite", color: "var(--bad)", icon: "🧐" };
}

export function RevealPanel({ data }: { data: SolutionResponse }) {
  const b = badgeFor(data.solution);
  const solved = data.solution?.is_correct ?? false;
  const culprit = data.characters.find((c: PublicCharacter) => c.id === data.true_solution?.who_did_it);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 24, borderRadius: "var(--radius)", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 56 }}>{b.icon}</div>
        <h2 style={{ color: b.color, margin: "6px 0 0" }}>{b.label}</h2>
        {solved && (
          <div style={{ marginTop: 12 }}>
            <Stamp style={{ fontSize: 14, transform: "rotate(-8deg)", animation: "stampin .6s 250ms both" }}>Case Closed</Stamp>
          </div>
        )}
      </div>

      <div style={{ background: "var(--cream)", border: "1px solid var(--cream-line)", padding: 16, borderRadius: "var(--radius)", color: "var(--cream-ink)" }}>
        <div style={{ fontSize: 12, color: "var(--cream-ink-dim)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--display)" }}>It was…</div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, margin: "2px 0 12px" }}>
          {culprit?.name ?? data.true_solution?.who_did_it ?? "?"}
        </div>
        <p style={{ margin: "0 0 10px", lineHeight: 1.55 }}><b>How:</b> {data.true_solution?.how ?? "?"}</p>
        <p style={{ margin: 0, lineHeight: 1.55 }}><b>Why:</b> {data.true_solution?.why ?? "?"}</p>
      </div>

      {data.explanation && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 16, borderRadius: "var(--radius)", lineHeight: 1.6 }}>
          {data.explanation}
        </div>
      )}
      <Link to="/"><Button size="lg" style={{ width: "100%" }}>Back to the casebook</Button></Link>
    </div>
  );
}
