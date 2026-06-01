import type { CSSProperties } from "react";

export function Tape({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute", height: 22, width: 80,
        background: "rgba(208,184,132,0.62)",
        borderLeft: "1px dashed rgba(120,96,50,0.4)",
        borderRight: "1px dashed rgba(120,96,50,0.4)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.12)", mixBlendMode: "multiply",
        ...style,
      }}
    />
  );
}
