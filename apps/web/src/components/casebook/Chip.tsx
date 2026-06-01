import type { CSSProperties, ReactNode } from "react";

type Tone = "ink" | "amber" | "rose" | "teal" | "good" | "cream";

const TONES: Record<Tone, CSSProperties> = {
  ink:   { background: "rgba(74,52,24,0.06)", color: "var(--ink-dim)", borderColor: "var(--line)" },
  amber: { background: "rgba(192,137,43,0.12)", color: "var(--accent)", borderColor: "rgba(192,137,43,0.5)" },
  rose:  { background: "rgba(178,57,47,0.1)", color: "var(--accent-2)", borderColor: "rgba(178,57,47,0.45)" },
  teal:  { background: "rgba(47,125,107,0.12)", color: "var(--teal)", borderColor: "rgba(47,125,107,0.45)" },
  good:  { background: "rgba(63,138,92,0.12)", color: "var(--good)", borderColor: "rgba(63,138,92,0.5)" },
  cream: { background: "var(--cream-2)", color: "var(--cream-ink-dim)", borderColor: "var(--cream-line)" },
};

export function Chip({ children, tone = "ink", style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700,
      whiteSpace: "nowrap", fontFamily: "var(--mono)", textTransform: "uppercase",
      letterSpacing: "0.05em", border: "1px solid", padding: "3px 8px", borderRadius: 4,
      ...TONES[tone], ...style,
    }}>{children}</span>
  );
}
