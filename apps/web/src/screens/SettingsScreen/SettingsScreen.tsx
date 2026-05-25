import { Link } from "react-router-dom";
import { useSettingsStore } from "../../state/settingsStore.js";

export function SettingsScreen() {
  const debugEnabled = useSettingsStore((s) => s.debugEnabled);
  const setDebugEnabled = useSettingsStore((s) => s.setDebugEnabled);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Settings</h1>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back</Link>
      </header>

      <div
        style={{
          background: "var(--surface)",
          padding: 16,
          borderRadius: "var(--radius)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
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
    </div>
  );
}
