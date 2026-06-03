import { Link } from "react-router-dom";
import { useSettingsStore } from "../../state/settingsStore.js";

export function SettingsScreen() {
  const debugEnabled = useSettingsStore((s) => s.debugEnabled);
  const setDebugEnabled = useSettingsStore((s) => s.setDebugEnabled);
  const audioEnabled = useSettingsStore((s) => s.audioEnabled);
  const setAudioEnabled = useSettingsStore((s) => s.setAudioEnabled);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>🔧 Grown-up Settings</h1>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>ADMIN PANEL</div>
        </div>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Back</Link>
      </header>

      <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            background: "var(--surface)",
            padding: 16,
            borderRadius: "var(--radius)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            border: "1px solid var(--line)",
            boxShadow: "0 1px 4px -2px rgba(40,28,12,0.3)",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>🐞 Debug mode</div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
              Shows the solution, logic tree, and quality checks on each mystery. Spoilers — turn off before a kid plays.
            </div>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={debugEnabled}
              onChange={(e) => setDebugEnabled(e.target.checked)}
              style={{ width: 24, height: 24 }}
              aria-label="Enable debug mode"
            />
          </label>
        </div>

        <div
          style={{
            background: "var(--surface)",
            padding: 16,
            borderRadius: "var(--radius)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            border: "1px solid var(--line)",
            boxShadow: "0 1px 4px -2px rgba(40,28,12,0.3)",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>🔊 Audio narration</div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
              Adds a "Read it to me" voice. Stories are silent by default — turn this on to show a
              button that generates the narration when you want it.
            </div>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={(e) => setAudioEnabled(e.target.checked)}
              style={{ width: 24, height: 24 }}
              aria-label="Enable audio narration"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
