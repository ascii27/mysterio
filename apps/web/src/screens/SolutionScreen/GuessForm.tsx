import { useState } from "react";
import type { PublicCharacter } from "../../api/mysteries.js";
import { Button } from "../../components/Button.js";
import { CharacterPicker } from "./CharacterPicker.js";

export function GuessForm({
  characters,
  onSubmit,
  pending,
}: {
  characters: PublicCharacter[];
  onSubmit: (g: { guess_who: string; guess_how: string; guess_why: string }) => void;
  pending: boolean;
}) {
  const [who, setWho] = useState<string | null>(null);
  const [how, setHow] = useState("");
  const [why, setWhy] = useState("");

  const canSubmit = who && how.trim().length >= 3 && why.trim().length >= 3 && !pending;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h3 style={{ marginBottom: 8 }}>Who did it?</h3>
        <CharacterPicker characters={characters} selected={who} onSelect={setWho} />
      </section>
      <section>
        <h3 style={{ marginBottom: 8 }}>How did they do it?</h3>
        <textarea
          value={how}
          onChange={(e) => setHow(e.target.value)}
          rows={3}
          placeholder="A sentence or two"
          style={{ width: "100%", padding: 10, borderRadius: 10, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--surface-2)" }}
        />
      </section>
      <section>
        <h3 style={{ marginBottom: 8 }}>Why did they do it?</h3>
        <textarea
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          rows={3}
          placeholder="A sentence or two"
          style={{ width: "100%", padding: 10, borderRadius: 10, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--surface-2)" }}
        />
      </section>
      <Button
        size="lg"
        disabled={!canSubmit}
        onClick={() => canSubmit && onSubmit({ guess_who: who!, guess_how: how.trim(), guess_why: why.trim() })}
      >
        {pending ? "Checking..." : "Submit my solution"}
      </Button>
    </div>
  );
}
