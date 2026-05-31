import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  debugEnabled: boolean;
  setDebugEnabled: (v: boolean) => void;
  audioEnabled: boolean;
  setAudioEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      debugEnabled: false,
      setDebugEnabled: (v) => set({ debugEnabled: v }),
      audioEnabled: false,
      setAudioEnabled: (v) => set({ audioEnabled: v }),
    }),
    { name: "mysterio.settings" },
  ),
);
