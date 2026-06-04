import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ageBandConfig } from "@mysterio/shared";
import { listMysteries } from "../../api/mysteries.js";
import { Chip } from "../../components/casebook/index.js";

export function RecentList({ playerId }: { playerId: string }) {
  const { data } = useQuery({
    queryKey: ["mysteries", playerId],
    queryFn: () => listMysteries(playerId, 10),
  });
  if (!data || data.mysteries.length === 0) {
    return <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No case files yet — start one above.</p>;
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {data.mysteries.map((m) => {
        const chip = m.solved
          ? <Chip tone="good">✓ Solved</Chip>
          : m.status === "failed"
          ? <Chip tone="rose">✗ Failed</Chip>
          : m.status !== "ready"
          ? <Chip tone="teal">In progress</Chip>
          : m.started
          ? <Chip tone="teal">In progress</Chip>
          : <Chip tone="amber">New</Chip>;
        return (
          <li key={m.id}>
            <Link
              to={`/mysteries/${m.id}`}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                background: "var(--surface)", border: "1px solid var(--line)", padding: 12,
                borderRadius: "var(--radius)", color: "var(--text)", textDecoration: "none",
                boxShadow: "0 2px 0 rgba(0,0,0,0.15)",
              }}
            >
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title ?? "Untitled"}</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                {m.target_age_range && <Chip tone="ink">Ages {ageBandConfig(m.target_age_range).label}</Chip>}
                {chip}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
