import type { CSSProperties, ReactNode } from "react";

export function Stamp({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="stamp" style={{ fontSize: 11, display: "inline-block", ...style }}>{children}</span>;
}
