import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { SceneFrame } from "../../components/casebook/index.js";
import { getPlace } from "../../api/world.js";
import { usePlayerStore } from "../../state/playerStore.js";

export function PlaceDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const placeId = id!;
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["place", placeId, playerId],
    queryFn: () => getPlace(placeId, playerId),
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ marginBottom: 16 }}>
        <Link to="/town" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Town</Link>
      </header>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load this place.</p>}

      {data && (
        <>
          <SceneFrame imageUrl={data.place.image_path ? `/images/${data.place.image_path}` : null} scene="town" height={200} kicker="Maple Hollow" style={{ marginBottom: 16 }} />
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>{data.place.name}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>{data.place.description}</p>

          <h2 style={{ fontSize: 16, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 10 }}>Cases set here</h2>
          {data.place.cases.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No cases here yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {data.place.cases.map((c) => (
                <li key={c.mystery_id}>
                  <Link to={`/mysteries/${c.mystery_id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: "var(--radius)", color: "var(--text)", textDecoration: "none", boxShadow: "0 2px 0 rgba(0,0,0,0.15)" }}>
                    <span style={{ fontFamily: "var(--display)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title ?? "Untitled case"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{c.solved ? "✓ solved" : "open"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
