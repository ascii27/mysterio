import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PlayerState {
  activePlayerId: string | null;
  setActivePlayer: (id: string) => void;
  clear: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      activePlayerId: null,
      setActivePlayer: (id) => set({ activePlayerId: id }),
      clear: () => set({ activePlayerId: null }),
    }),
    { name: "mysterio.activePlayer" },
  ),
);
