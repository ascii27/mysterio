import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/Button.js";
import { useGenerationJob } from "../../hooks/useGenerationJob.js";
import { FailedMystery } from "./FailedMystery.js";
import { LoadingMystery } from "./LoadingMystery.js";

export function PlaybackScreen() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGenerationJob(id!);

  if (isLoading || !data) return <LoadingMystery status="pending" />;
  if (isError) return <FailedMystery reason={null} />;
  if (data.status === "failed") return <FailedMystery reason={data.failure_reason} />;
  if (data.status !== "ready") return <LoadingMystery status={data.status} />;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back</Link>
        <Link to={`/mysteries/${id}/solve`}><Button>I think I know!</Button></Link>
      </header>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{data.title}</h1>
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
        Audio comes in M3 — narrative shown for now.
      </p>
      <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {data.narrative_text}
      </div>
    </div>
  );
}
