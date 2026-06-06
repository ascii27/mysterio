import { RANKS } from "@mysterio/shared";

export function RankBadge({ rankIndex, size = 48 }: { rankIndex: number; size?: number }) {
  const rank = RANKS[Math.max(0, Math.min(RANKS.length - 1, rankIndex))]!;
  return (
    <div
      aria-hidden="true"
      title={rank.name}
      style={{
        width: size, height: size, borderRadius: "50%", flex: "0 0 auto",
        display: "grid", placeItems: "center",
        background: `radial-gradient(120% 120% at 30% 25%, ${rank.medal}, rgba(0,0,0,0.28))`,
        color: "#2b2318", fontFamily: "var(--display)", fontWeight: 800,
        fontSize: size * 0.42, lineHeight: 1,
        border: "3px solid var(--cream)",
        boxShadow: "0 2px 6px -1px rgba(0,0,0,0.45)",
      }}
    >
      {rank.name[0]}
    </div>
  );
}
