import { useQuery } from "@tanstack/react-query";
import { listPlayers } from "../api/players.js";
import { usePlayerStore } from "../state/playerStore.js";
import { Kicker } from "../components/casebook/index.js";

export function PlayerPicker() {
  const setActivePlayer = usePlayerStore((s) => s.setActivePlayer);
  const { data, isLoading, isError } = useQuery({ queryKey: ["players"], queryFn: listPlayers });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (isError || !data) return <div style={{ padding: 24, color: "var(--bad)" }}>Couldn't load players.</div>;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>
        <div style={{ fontSize: 50, animation: "floaty 4s ease-in-out infinite" }}>🔎</div>
        <h1 style={{ fontSize: 48, margin: "4px 0 2px" }}>Mysterio</h1>
        <div style={{ color: "var(--accent)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, letterSpacing: "0.12em" }}>
          THE CASEBOOK
        </div>
        <p style={{ color: "var(--text-dim)", margin: "10px 0 24px" }}>Who's on the case today?</p>
        <Kicker style={{ textAlign: "left" }}>Detectives</Kicker>
        <div style={{ display: "grid", gap: 14 }}>
          {data.players.map((p) => (
            <button
              key={p.id}
              aria-label={p.name}
              onClick={() => setActivePlayer(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                background: "var(--surface)", border: "1px solid var(--line)",
                borderRadius: "var(--radius)", padding: 16, cursor: "pointer",
                boxShadow: "0 2px 0 rgba(0,0,0,0.2)",
              }}
            >
              <div aria-hidden="true" style={{
                width: 48, height: 48, borderRadius: 10, flex: "0 0 auto", display: "grid", placeItems: "center",
                background: "radial-gradient(120% 120% at 30% 25%, var(--accent), #7a3b1a)",
                color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 22,
                border: "3px solid #fbf4e3",
              }}>{(p.name[0] ?? "?").toUpperCase()}</div>
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22 }}>{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
