import type { MysteryStatus } from "@mysterio/shared";

const COPY: Record<MysteryStatus, string> = {
  pending: "Gathering clues...",
  generating_logic: "Gathering clues...",
  validating: "Checking the case is solvable...",
  writing: "Writing the story...",
  synthesizing: "Recording the narrator...",
  ready: "Ready",
  failed: "Failed",
};

export function LoadingMystery({ status }: { status: MysteryStatus }) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 64, animation: "floaty 2.5s ease-in-out infinite", display: "inline-block" }}>🔎</div>
        <h2 style={{ fontSize: 24, marginTop: 16 }}>The detective is on the case</h2>
        <p style={{ fontSize: 17, marginTop: 8, color: "var(--text-dim)" }}>{COPY[status]}</p>
      </div>
    </div>
  );
}
