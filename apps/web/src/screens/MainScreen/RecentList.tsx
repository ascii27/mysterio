import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listMysteries } from "../../api/mysteries.js";

export function RecentList({ playerId }: { playerId: string }) {
  const { data } = useQuery({
    queryKey: ["mysteries", playerId],
    queryFn: () => listMysteries(playerId, 10),
  });
  if (!data || data.mysteries.length === 0) {
    return <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No mysteries yet — start one above.</p>;
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {data.mysteries.map((m) => {
        const status = m.solved ? "✓ Solved" : m.status === "failed" ? "✗ Failed" : m.status === "ready" ? "Unsolved" : "In progress";
        return (
          <li key={m.id}>
            <Link
              to={`/mysteries/${m.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                background: "var(--surface)",
                padding: 12,
                borderRadius: "var(--radius)",
                color: "var(--text)",
                textDecoration: "none",
              }}
            >
              <span>{m.title ?? "Untitled"}</span>
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{status}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
