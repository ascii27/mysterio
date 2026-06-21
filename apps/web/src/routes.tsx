import { Navigate, Route, Routes as RRRoutes } from "react-router-dom";
import { MainScreen } from "./screens/MainScreen/MainScreen.js";
import { PlayerPicker } from "./screens/PlayerPicker.js";
import { PlaybackScreen } from "./screens/PlaybackScreen/PlaybackScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen/SettingsScreen.js";
import { SolutionScreen } from "./screens/SolutionScreen/SolutionScreen.js";
import { TrophyRoom } from "./screens/TrophyRoom/TrophyRoom.js";
import { CharacterDetailScreen } from "./screens/CharacterDetail/CharacterDetailScreen.js";
import { WhosWhoScreen } from "./screens/WhosWho/WhosWhoScreen.js";
import { PlaceDetailScreen } from "./screens/PlaceDetail/PlaceDetailScreen.js";
import { TownScreen } from "./screens/Town/TownScreen.js";
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
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/trophies" element={<TrophyRoom />} />
      <Route path="/whos-who" element={<WhosWhoScreen />} />
      <Route path="/characters/:id" element={<CharacterDetailScreen />} />
      <Route path="/places/:id" element={<PlaceDetailScreen />} />
      <Route path="/town" element={<TownScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </RRRoutes>
  );
}
