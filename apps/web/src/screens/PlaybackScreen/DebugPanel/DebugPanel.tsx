import { type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMysteryDebug, type MysteryDebug } from "../../../api/mysteries.js";

const box: CSSProperties = {
  background: "var(--surface)",
  border: "1px dashed var(--text-dim)",
  borderRadius: "var(--radius)",
  padding: 12,
  marginTop: 16,
  fontSize: 13,
};
const h: CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", margin: "12px 0 4px" };
const mono: CSSProperties = { fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" };

export function DebugPanel({ mysteryId }: { mysteryId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["debug", mysteryId],
    queryFn: () => getMysteryDebug(mysteryId),
  });

  return (
    <details style={box}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>🐞 Debug</summary>
      {isLoading && <p>Loading debug…</p>}
      {isError && <p style={{ color: "var(--bad)" }}>Failed to load debug data.</p>}
      {data && <DebugBody d={data} />}
    </details>
  );
}

function DebugBody({ d }: { d: MysteryDebug }) {
  const ls = d.logic_structure;
  const culprit = ls?.characters.find((c) => c.is_culprit);
  const missing = d.clue_coverage.filter((c) => !c.present);

  return (
    <div>
      {!ls && <p>No logic structure yet (status: {d.status}).</p>}

      {ls && (
        <>
          <div style={h}>Case &amp; solution</div>
          <div><b>Question:</b> {ls.central_question}</div>
          <div><b>WHO:</b> {culprit ? `${culprit.name} (${culprit.id})` : ls.true_solution.who_did_it}</div>
          <div><b>HOW:</b> {ls.true_solution.how}</div>
          <div><b>WHY:</b> {ls.true_solution.why}</div>

          <div style={h}>Logic tree — characters</div>
          {ls.characters.map((c) => (
            <div key={c.id}>
              {c.is_culprit ? "🔴 " : "• "}<b>{c.name}</b> ({c.role}){c.motive ? ` — motive: ${c.motive}` : ""}
            </div>
          ))}

          <div style={h}>Essential clues</div>
          {ls.essential_clues.map((c) => (
            <div key={c.id}>• [{c.id}] {c.description}</div>
          ))}
          <div style={h}>False clues</div>
          {ls.false_clues.map((c) => (
            <div key={c.id}>• [{c.id}] {c.description}</div>
          ))}

          <div style={h}>Solve path</div>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            {ls.logic_chain.map((step, i) => (<li key={i}>{step}</li>))}
          </ol>
        </>
      )}

      <div style={h}>Clue coverage (does each essential clue appear in the story?)</div>
      {d.clue_coverage.length === 0 && <div>n/a</div>}
      {d.clue_coverage.map((c) => (
        <div key={c.id} style={{ color: c.present ? "var(--text)" : "var(--bad)" }}>
          {c.present ? "✓" : "✗"} [{c.id}] score {c.score.toFixed(2)}
        </div>
      ))}
      {missing.length > 0 && (
        <div style={{ color: "var(--bad)", fontWeight: 700, marginTop: 4 }}>
          ⚠ {missing.length} essential clue(s) missing from the story prose — this mystery may be unsolvable.
        </div>
      )}

      <div style={h}>Validation</div>
      <div>passed: {String(d.validation.passed)} · attempts: {d.validation.attempts}</div>
      {d.validation.notes && <div style={mono}>{d.validation.notes}</div>}

      <div style={h}>Difficulty metrics</div>
      <div>
        {d.metrics.difficulty} · essential {d.metrics.essential_count} · false {d.metrics.false_count} · words {d.metrics.word_count}
        {d.metrics.target_words ? ` (target ${d.metrics.min_words}-${d.metrics.max_words})` : ""}
      </div>

      {ls && (
        <>
          <div style={h}>Distractor options</div>
          <div><b>HOW distractors:</b></div>
          {ls.how_distractors.map((s, i) => (
            <div key={i} style={{ color: culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "var(--bad)" : "var(--text)" }}>
              • {s}{culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "  ⚠ names culprit" : ""}
            </div>
          ))}
          <div><b>WHY distractors:</b></div>
          {ls.why_distractors.map((s, i) => (
            <div key={i} style={{ color: culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "var(--bad)" : "var(--text)" }}>
              • {s}{culprit && s.toLowerCase().includes(culprit.name.toLowerCase()) ? "  ⚠ names culprit" : ""}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
