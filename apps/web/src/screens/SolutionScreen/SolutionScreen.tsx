import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getMystery } from "../../api/mysteries.js";
import { getSolution, submitSolution } from "../../api/solutions.js";
import { ClueSummary } from "./ClueSummary.js";
import { GuessForm } from "./GuessForm.js";
import { RevealPanel } from "./RevealPanel.js";

export function SolutionScreen() {
  const { id } = useParams<{ id: string }>();
  const mysteryId = id!;

  const mysteryQ = useQuery({ queryKey: ["mystery", mysteryId], queryFn: () => getMystery(mysteryId) });
  const solutionQ = useQuery({ queryKey: ["solution", mysteryId], queryFn: () => getSolution(mysteryId), retry: false });

  const submitM = useMutation({
    mutationFn: (g: { guess_who: string; guess_how: string; guess_why: string }) => submitSolution(mysteryId, g),
    onSuccess: () => { solutionQ.refetch(); },
  });

  if (!mysteryQ.data) return <div style={{ padding: 24 }}>Loading...</div>;
  const characters = mysteryQ.data.characters ?? [];

  const showReveal = solutionQ.data?.solution !== null && solutionQ.data?.solution !== undefined;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", display: "grid", gap: 16 }}>
      <header>
        <Link to={`/mysteries/${mysteryId}`} style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back to story</Link>
        <h1 style={{ marginBottom: 4 }}>{mysteryQ.data.title}</h1>
      </header>

      {!showReveal && <ClueSummary mysteryId={mysteryId} />}
      {!showReveal && (
        <GuessForm
          characters={characters}
          onSubmit={(g) => submitM.mutate(g)}
          pending={submitM.isPending}
        />
      )}
      {showReveal && solutionQ.data && <RevealPanel data={solutionQ.data} />}
    </div>
  );
}
