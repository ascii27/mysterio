import { useState, type CSSProperties, type ReactNode } from "react";

type Tone = "manila" | "red" | "green" | "amber";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  manila: { bg: "#d9bd84", fg: "#4a3a1c" },
  red:    { bg: "#b2392f", fg: "#fff2ee" },
  green:  { bg: "#2f7d6b", fg: "#eafff8" },
  amber:  { bg: "#c0892b", fg: "#33240c" },
};

export function Folder({
  tab, tone = "manila", stamp, onClick, children, style,
}: {
  tab: ReactNode; tone?: Tone; stamp?: ReactNode; onClick?: () => void;
  children: ReactNode; style?: CSSProperties;
}) {
  const tc = TONES[tone];
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: "relative", paddingTop: 15, cursor: onClick ? "pointer" : "default",
        transition: "transform .14s", transform: h && onClick ? "translateY(-3px)" : "none", ...style,
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 14, height: 19, maxWidth: "72%", padding: "0 12px",
        display: "flex", alignItems: "center", background: tc.bg, color: tc.fg,
        borderRadius: "8px 8px 0 0", fontFamily: "var(--mono)", fontSize: 9.5, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis", boxShadow: "0 -1px 2px rgba(0,0,0,0.12)",
      }}>{tab}</div>
      <div style={{
        background: "linear-gradient(168deg,#ecd9a8,#e1c98e)", border: "1px solid #c8ab68",
        borderRadius: "0 9px 9px 9px", padding: 10, position: "relative",
        boxShadow: h && onClick ? "0 12px 22px -10px rgba(40,28,12,0.6)" : "0 3px 8px -3px rgba(40,28,12,0.45)",
      }}>
        {children}
        {stamp && (
          <div className="stamp" style={{ position: "absolute", right: 8, top: 8, fontSize: 9.5, transform: "rotate(8deg)" }}>
            {stamp}
          </div>
        )}
      </div>
    </div>
  );
}
