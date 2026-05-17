import { useState } from "react";
import type { PublicCharacter } from "../../api/mysteries.js";
import { Button } from "../../components/Button.js";
import { CharacterPicker } from "./CharacterPicker.js";

export function GuessForm({
  characters,
  howOptions,
  whyOptions,
  onSubmit,
  pending,
}: {
  characters: { id: string; name: string; role: string }[];
  howOptions: string[];
  whyOptions: string[];
  onSubmit: (g: { guess_who: string; guess_how: string; guess_why: string }) => void;
  pending: boolean;
}) {
  const [who, setWho] = useState<string | null>(null);
  const [how, setHow] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  const canSubmit = !!who && !!how && !!why && !pending;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section>
        <h3 style={{ marginBottom: 8 }}>Who did it?</h3>
        <CharacterPicker characters={characters as unknown as PublicCharacter[]} selected={who} onSelect={setWho} />
      </section>
      <section>
        <h3 style={{ marginBottom: 8 }}>How did they do it?</h3>
        <OptionPicker options={howOptions} value={how} onChange={setHow} ariaPrefix="how" />
      </section>
      <section>
        <h3 style={{ marginBottom: 8 }}>Why did they do it?</h3>
        <OptionPicker options={whyOptions} value={why} onChange={setWhy} ariaPrefix="why" />
      </section>
      <Button
        size="lg"
        disabled={!canSubmit}
        onClick={() => canSubmit && onSubmit({ guess_who: who!, guess_how: how!, guess_why: why! })}
      >
        {pending ? "Checking..." : "Submit my solution"}
      </Button>
    </div>
  );
}

function OptionPicker({
  options,
  value,
  onChange,
  ariaPrefix,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  ariaPrefix: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {options.map((opt, i) => {
        const active = value === opt;
        return (
          <button
            type="button"
            key={`${ariaPrefix}-${i}`}
            onClick={() => onChange(opt)}
            aria-pressed={active}
            style={{
              padding: 12,
              background: active ? "var(--accent)" : "var(--surface-2)",
              color: active ? "#1a1530" : "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "var(--radius)",
              textAlign: "left",
              fontSize: 14,
              lineHeight: 1.5,
              cursor: "pointer",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
