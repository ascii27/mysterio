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
        <div style={{ fontSize: 64, animation: "spin 2.5s linear infinite", display: "inline-block" }}>🔎</div>
        <p style={{ fontSize: 20, marginTop: 16 }}>{COPY[status]}</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
