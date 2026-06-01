import type { CSSProperties, ReactNode } from "react";

export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "var(--ink-dim)", marginBottom: 10, ...style,
    }}>{children}</div>
  );
}
