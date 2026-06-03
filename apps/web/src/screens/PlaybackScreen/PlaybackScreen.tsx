import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { NarrativeAnnotation } from "@mysterio/shared";
import { createClue } from "../../api/clues.js";
import { generateAudio } from "../../api/mysteries.js";
import { Button } from "../../components/Button.js";
import { SceneFrame, SCENE_FOR_CATEGORY } from "../../components/casebook/index.js";
import { useGenerationJob } from "../../hooks/useGenerationJob.js";
import { useSettingsStore } from "../../state/settingsStore.js";
import { AnnotatedNarrative } from "./AnnotatedNarrative/AnnotatedNarrative.js";
import { BriefingCard } from "./BriefingCard/BriefingCard.js";
import { ClueTracker } from "./ClueTracker/ClueTracker.js";
import { DebugPanel } from "./DebugPanel/DebugPanel.js";
import { FailedMystery } from "./FailedMystery.js";
import { LoadingMystery } from "./LoadingMystery.js";

export function PlaybackScreen() {
  const { id } = useParams<{ id: string }>();
  const mysteryId = id!;
  const { data, isLoading, isError } = useGenerationJob(mysteryId);
  const [started, setStarted] = useState(false);
  const [focusedClueId, setFocusedClueId] = useState<string | null>(null);
  const qc = useQueryClient();
  const debugEnabled = useSettingsStore((s) => s.debugEnabled);
  const audioEnabled = useSettingsStore((s) => s.audioEnabled);

  const tapAnnotation = useMutation({
    mutationFn: (a: NarrativeAnnotation) => {
      // For person annotations, look up the character to get a kid-readable content snippet.
      // For clue annotations, use the parser-emitted text (matches what the kid tapped).
      const character = data?.characters?.find((c) => c.id === a.id);
      const content =
        a.type === "person"
          ? character
            ? `${character.name} — ${character.role}: ${character.description}`
            : a.text
          : a.text;
      const category_type = a.type === "person" ? "character" : guessClueCategory(a, data);
      const annotation_id = `${a.type === "person" ? "p" : "c"}-${a.id}`;
      // Server dedupes by (mystery_id, annotation_id) per the partial unique index
      // from M5b.1 — a re-tap returns 200 with the existing row, not 409. onSuccess
      // fires for both 200 and 201 with the same clue id, focusing the existing row.
      return createClue(mysteryId, {
        category_type,
        content,
        source: "annotation",
        annotation_id,
      });
    },
    onSuccess: (res) => {
      setFocusedClueId(res.clue.id);
      qc.invalidateQueries({ queryKey: ["clues", mysteryId] });
    },
    onError: (err) => {
      // Silent-failure posture matches the rest of the MVP, but log for M5b.9 debugging.
      console.error("[tapAnnotation]", err);
    },
  });

  if (isLoading || !data) return <LoadingMystery status="pending" />;
  if (isError) return <FailedMystery reason={null} />;
  if (data.status === "failed") return <FailedMystery reason={data.failure_reason} />;
  if (data.status !== "ready") return <LoadingMystery status={data.status} />;

  if (!started) {
    return <BriefingCard mystery={data} onStart={() => setStarted(true)} />;
  }

  const text = data.narrative_text ?? "";
  const annotations = data.narrative_annotations ?? [];

  return (
    <>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", paddingBottom: 80 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Back</Link>
          <Link to={`/mysteries/${mysteryId}/solve`}><Button>I think I know!</Button></Link>
        </header>
        <SceneFrame
          imageUrl={data.cover_image_url}
          scene={SCENE_FOR_CATEGORY[data.category] ?? "generic"}
          height={190}
          kicker="The Case Of"
          style={{ marginBottom: 16 }}
        />
        <h1 style={{ fontSize: 30, marginBottom: 8 }}>{data.title}</h1>
        {data.central_question && (
          <p style={{ fontSize: 15, color: "var(--text)", marginBottom: 8 }}>
            <b>Your case:</b> {data.central_question}
          </p>
        )}
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
          Tap a highlighted name or clue to add it to your notes.
        </p>
        {audioEnabled && <AudioSection mysteryId={mysteryId} audioUrl={data.audio_url} />}
        <AnnotatedNarrative
          text={text}
          annotations={annotations}
          onTap={(a) => tapAnnotation.mutate(a)}
        />
        {debugEnabled && <DebugPanel mysteryId={mysteryId} />}
      </div>
      <ClueTracker
        mysteryId={mysteryId}
        focusedClueId={focusedClueId}
        onClearFocus={() => setFocusedClueId(null)}
      />
    </>
  );
}

function guessClueCategory(
  annotation: NarrativeAnnotation,
  mystery: unknown,
): "item" | "location" | "event" | "note" {
  // The mystery DTO doesn't include essential_clues (those are inside logic_structure_json
  // which the server intentionally doesn't expose to the client). Annotations only carry
  // type + id, so for clue annotations we default to "note". The kid can re-categorise
  // later via the existing ClueTracker tabs. This is acceptable for MVP — refining the
  // server's GET to also return public-essential-clue metadata is a v2 polish item.
  void annotation;
  void mystery;
  return "note";
}

function AudioSection({ mysteryId, audioUrl }: { mysteryId: string; audioUrl: string | null }) {
  const qc = useQueryClient();
  const gen = useMutation({
    mutationFn: () => generateAudio(mysteryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mystery", mysteryId] }),
  });

  if (audioUrl) {
    return (
      <audio
        src={audioUrl}
        controls
        preload="metadata"
        playsInline
        style={{ width: "100%", marginBottom: 16 }}
      />
    );
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <Button variant="cream" disabled={gen.isPending} onClick={() => gen.mutate()}>
        {gen.isPending ? "Generating audio…" : "🔊 Generate audio"}
      </Button>
      {gen.isError && (
        <p style={{ color: "var(--bad)", fontSize: 13, marginTop: 6 }}>
          Couldn't generate audio. Try again.
        </p>
      )}
    </div>
  );
}
