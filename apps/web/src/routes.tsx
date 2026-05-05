import { Navigate, Route, Routes as RRRoutes } from "react-router-dom";
import { PlayerPicker } from "./screens/PlayerPicker.js";
import { usePlayerStore } from "./state/playerStore.js";

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 24 }}>{name} (placeholder)</div>;
}

function Home() {
  const activePlayerId = usePlayerStore((s) => s.activePlayerId);
  if (!activePlayerId) return <PlayerPicker />;
  return <Placeholder name="MainScreen" />;
}

export function Routes() {
  return (
    <RRRoutes>
      <Route path="/" element={<Home />} />
      <Route path="/mysteries/:id" element={<Placeholder name="Playback" />} />
      <Route path="/mysteries/:id/solve" element={<Placeholder name="Solve" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </RRRoutes>
  );
}
