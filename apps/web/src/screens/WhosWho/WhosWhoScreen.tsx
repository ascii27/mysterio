import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCharacters } from "../../api/world.js";

/** Monogram fallback while a portrait doesn't exist yet. */
function Monogram({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center", background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, color: "var(--text-dim)" }}>
      {initials || "?"}
    </span>
  );
}

function Thumb({ name, portrait }: { name: string; portrait: string | null }) {
  if (!portrait) return <Monogram name={name} />;
  return <img src={`/images/${portrait}`} alt="" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px var(--line)" }} />;
}

export function WhosWhoScreen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["characters"],
    queryFn: () => listCharacters(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Who's Who in Maple Hollow</h1>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontSize: 14 }}>← Back</Link>
      </header>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading the townsfolk…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load the town just now.</p>}
      {data && data.characters.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No residents yet.</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {data?.characters.map((c) => (
          <li key={c.id}>
            <Link to={`/characters/${c.id}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: "var(--radius)", boxShadow: "0 2px 0 rgba(0,0,0,0.15)", color: "var(--text)", textDecoration: "none" }}>
              <Thumb name={c.name} portrait={c.portrait_image_path} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--display)", fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description}</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                {c.appearance_count} {c.appearance_count === 1 ? "case" : "cases"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
