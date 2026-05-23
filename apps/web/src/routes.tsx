import { Navigate, Route, Routes as RRRoutes } from "react-router-dom";
import { MainScreen } from "./screens/MainScreen/MainScreen.js";
import { PlayerPicker } from "./screens/PlayerPicker.js";
import { PlaybackScreen } from "./screens/PlaybackScreen/PlaybackScreen.js";
import { SolutionScreen } from "./screens/SolutionScreen/SolutionScreen.js";
import { usePlayerStore } from "./state/playerStore.js";

function Home() {
  const activePlayerId = usePlayerStore((s) => s.activePlayerId);
  if (!activePlayerId) return <PlayerPicker />;
  return <MainScreen />;
}

export function Routes() {
  return (
    <RRRoutes>
      <Route path="/" element={<Home />} />
      <Route path="/mysteries/:id" element={<PlaybackScreen />} />
      <Route path="/mysteries/:id/solve" element={<SolutionScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </RRRoutes>
  );
}
