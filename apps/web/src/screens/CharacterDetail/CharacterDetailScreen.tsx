import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getCharacter } from "../../api/world.js";
import { usePlayerStore } from "../../state/playerStore.js";

function Monogram({ name, size }: { name: string; size: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <span style={{ width: size, height: size, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", fontFamily: "var(--display)", fontWeight: 700, fontSize: size / 2.6, color: "var(--text-dim)" }}>
      {initials || "?"}
    </span>
  );
}

export function CharacterDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const characterId = id!;
  const playerId = usePlayerStore((s) => s.activePlayerId)!;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["character", characterId, playerId],
    queryFn: () => getCharacter(characterId, playerId),
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ marginBottom: 16 }}>
        <Link to="/whos-who" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Who's Who</Link>
      </header>

      {isLoading && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Loading…</p>}
      {isError && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Couldn't load this resident.</p>}

      {data && (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
            {data.character.portrait_image_path
              ? <img src={`/images/${data.character.portrait_image_path}`} alt="" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px var(--line)" }} />
              : <Monogram name={data.character.name} size={96} />}
            <h1 style={{ margin: 0, fontSize: 28 }}>{data.character.name}</h1>
          </div>

          <p style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>{data.character.description}</p>

          <h2 style={{ fontSize: 16, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: 10 }}>Appears in these cases</h2>
          {data.character.appearances.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No cases yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {data.character.appearances.map((a) => (
                <li key={a.mystery_id}>
                  <Link to={`/mysteries/${a.mystery_id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: "var(--radius)", color: "var(--text)", textDecoration: "none", boxShadow: "0 2px 0 rgba(0,0,0,0.15)" }}>
                    <span style={{ fontFamily: "var(--display)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title ?? "Untitled case"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>
                      {a.role_in_case}{a.is_culprit ? " · culprit" : ""}
                    </span>
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
