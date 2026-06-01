export interface AudioRow {
  id: string;
  status: string;
  narrative_text: string | null;
  audio_path: string | null;
}

export interface AudioDeps {
  generateAudio: (id: string, narrativeText: string) => Promise<{ ok: true; audioPath: string } | { ok: false; error: string }>;
  persistAudioPath: (id: string, audioPath: string) => void;
}

export interface AudioOutcome {
  status: number;
  body: unknown;
}

export async function resolveMysteryAudio(
  row: AudioRow | undefined,
  deps: AudioDeps,
): Promise<AudioOutcome> {
  if (!row) {
    return { status: 404, body: { error: "not_found" } };
  }
  if (row.audio_path) {
    // Idempotent — audio for a given mystery never changes.
    return { status: 200, body: { audio_url: `/audio/${row.audio_path}` } };
  }
  if (row.status !== "ready" || !row.narrative_text) {
    return { status: 409, body: { error: "not_ready" } };
  }
  const res = await deps.generateAudio(row.id, row.narrative_text);
  if (!res.ok) {
    return { status: 502, body: { error: "tts_failed", detail: res.error } };
  }
  deps.persistAudioPath(row.id, res.audioPath);
  return { status: 200, body: { audio_url: `/audio/${res.audioPath}` } };
}
