import { useQuery } from "@tanstack/react-query";
import { listPlayers } from "../api/players.js";
import { Button } from "../components/Button.js";
import { usePlayerStore } from "../state/playerStore.js";

export function PlayerPicker() {
  const setActivePlayer = usePlayerStore((s) => s.setActivePlayer);
  const { data, isLoading, isError } = useQuery({ queryKey: ["players"], queryFn: listPlayers });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (isError || !data) return <div style={{ padding: 24, color: "var(--bad)" }}>Couldn't load players.</div>;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>Mysterio</h1>
        <p style={{ color: "var(--text-dim)", marginBottom: 32 }}>Who's playing?</p>
        <div style={{ display: "grid", gap: 16 }}>
          {data.players.map((p) => (
            <Button key={p.id} size="lg" onClick={() => setActivePlayer(p.id)}>
              {p.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
