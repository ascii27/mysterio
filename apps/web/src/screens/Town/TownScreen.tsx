import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { SceneFrame } from "../../components/casebook/index.js";
import { listPlaces } from "../../api/world.js";
import { TOWN_MAP_IMAGE, TOWN_HOTSPOTS } from "./townMap.js";

export function TownScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["places"], queryFn: () => listPlaces(), staleTime: 5 * 60 * 1000 });
  const places = data?.places ?? [];
  const nameById = new Map(places.map((p) => [p.id, p.name]));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Maple Hollow</h1>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 14 }}>← Back</Link>
      </header>

      {/* Map with tappable hotspots. The map image falls back to a parchment box if not yet generated. */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "inset 0 0 0 1.5px var(--line)", background: "var(--surface-2)", marginBottom: 24 }}>
        <img src={TOWN_MAP_IMAGE} alt="Map of Maple Hollow" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {TOWN_HOTSPOTS.filter((h) => nameById.has(h.id)).map((h) => (
          <Link key={h.id} to={`/places/${h.id}`} title={nameById.get(h.id)} style={{ position: "absolute", top: `${h.topPct}%`, left: `${h.leftPct}%`, transform: "translate(-50%, -50%)", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: "var(--surface)", color: "var(--text)", textDecoration: "none", boxShadow: "0 1px 0 rgba(0,0,0,0.25), inset 0 0 0 1.5px var(--line)", whiteSpace: "nowrap" }}>
            📍 {nameById.get(h.id)}
          </Link>
        ))}
      </div>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading the town…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load the town just now.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {places.map((p) => (
          <Link key={p.id} to={`/places/${p.id}`} style={{ color: "var(--text)", textDecoration: "none" }}>
            <SceneFrame imageUrl={p.image_path ? `/images/${p.image_path}` : null} scene="town" height={120} tape={false} />
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, marginTop: 6 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
