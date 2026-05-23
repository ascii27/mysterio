# M4 Implementation Plan — Clue tracker + solution flow + hints

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the kid-facing clue tracker (bottom-sheet drawer on `PlaybackScreen`), the full solve flow (`SolutionScreen` with character picker + guess form + reveal), and the two-tier hint system (≤2 `hintAgent`-generated nudges + "I give up" with `explanationAgent` recap). All audio dependencies are deliberately deferred — narrative renders in the existing prose div, `audio_timestamp_ms` on clues is always `null`, no `usePlaybackStore`, no `TranscriptPanel`.

**Architecture:** Backend adds three Fastify route modules (`clues`, `solutions`, `hints`) plus two new Anthropic agents (`hintAgent`, `explanationAgent`) under the existing `services/generation/` tree. Frontend adds five components on a new `SolutionScreen` route, plus a bottom-sheet `ClueTracker` overlay on `PlaybackScreen`. All DB tables (`clues`, `solutions`, `hints`) already exist in the schema and migrations from M1 — no migration work needed.

**Tech Stack:** Fastify 5, Drizzle (better-sqlite3), Anthropic SDK 0.96.0, Zod 3, React 18 + Vite, TanStack Query 5, React Router 6, vitest.

**Source spec:** `docs/superpowers/specs/2026-05-16-m4-with-hints-design.md` (approved 2026-05-16).

**Modifications vs original plan §M4.1-§M4.5 / §M5.1-§M5.2:** (a) M4.3 ClueTracker is rewritten as a bottom-sheet drawer (collapsed pill ↔ expanded sheet) instead of an inline panel; drops `usePlaybackStore` dep; omits `audio_timestamp_ms`. (b) Hint agent + UI (originally M5.1/M5.2) are pulled forward as M4.6/M4.7. (c) `.ts` import extensions in the plan's code blocks are corrected to `.js` inline (no silent fixes needed).

**Continue using:** sonnet for implementer + reviewer subagents (per `workflow_model_selection` memory); per-task review pattern of implementer → spec compliance → code quality → fix → re-review (per `workflow_subagent_driven` memory) — every M2/M3 task review found a real bug.

---

## Task M4.1: shared Clue, Solution, Hint types

**Files:**
- Create: `packages/shared/src/types/clue.ts`
- Create: `packages/shared/src/types/solution.ts`
- Create: `packages/shared/src/types/hint.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Clue type**

`packages/shared/src/types/clue.ts`:

```ts
import type { ClueCategoryType } from "./logicStructure.js";

export interface Clue {
  id: string;
  mystery_id: string;
  category_type: ClueCategoryType;
  content: string;
  audio_timestamp_ms: number | null;
  created_at: number;
}
```

- [ ] **Step 2: Solution type**

`packages/shared/src/types/solution.ts`:

```ts
export interface Solution {
  id: string;
  mystery_id: string;
  guess_who: string | null;
  guess_how: string | null;
  guess_why: string | null;
  is_correct: number;          // SQLite: 0 | 1
  who_match: number | null;    // SQLite: 0 | 1 | null
  how_match: number | null;
  why_match: number | null;
  hints_used: number;
  gave_up: number;             // SQLite: 0 | 1
  explanation: string | null;
  created_at: number;
}
```

- [ ] **Step 3: Hint type**

`packages/shared/src/types/hint.ts`:

```ts
export interface Hint {
  id: string;
  mystery_id: string;
  content: string;
  created_at: number;
}
```

- [ ] **Step 4: Update shared barrel**

Add to `packages/shared/src/index.ts`:

```ts
export * from "./types/clue.js";
export * from "./types/solution.js";
export * from "./types/hint.js";
```

- [ ] **Step 5: Build + typecheck**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/shared typecheck
```
Expected: both pass, no output (clean compile).

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "$(cat <<'EOF'
M4.1: shared Clue, Solution, Hint types

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M4.2: clues router (CRUD)

**Files:**
- Create: `apps/server/src/routes/clues.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Clues router**

`apps/server/src/routes/clues.ts`:

```ts
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { clues } from "../db/schema.js";
import { shortId } from "../utils/ids.js";

const createBody = z.object({
  category_type: z.enum(["character", "item", "location", "event", "note"]),
  content: z.string().min(1).max(500),
  audio_timestamp_ms: z.number().int().nonnegative().optional(),
});

const patchBody = z.object({
  content: z.string().min(1).max(500),
});

export async function cluesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/clues", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const id = shortId();
    db.insert(clues).values({
      id,
      mystery_id: req.params.id,
      category_type: parsed.data.category_type,
      content: parsed.data.content,
      audio_timestamp_ms: parsed.data.audio_timestamp_ms ?? null,
    }).run();
    reply.status(201);
    const row = db.select().from(clues).where(eq(clues.id, id)).get();
    return { clue: row };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/clues", async (req) => {
    const db = getDb();
    const rows = db.select().from(clues).where(eq(clues.mystery_id, req.params.id)).all();
    return { clues: rows };
  });

  app.patch<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    db.update(clues).set({ content: parsed.data.content }).where(eq(clues.id, req.params.clueId)).run();
    const row = db.select().from(clues).where(eq(clues.id, req.params.clueId)).get();
    if (!row) { reply.status(404); return { error: "not_found" }; }
    return { clue: row };
  });

  app.delete<{ Params: { id: string; clueId: string } }>("/mysteries/:id/clues/:clueId", async (req, reply) => {
    const db = getDb();
    db.delete(clues).where(eq(clues.id, req.params.clueId)).run();
    reply.status(204);
  });
}
```

- [ ] **Step 2: Register router in index**

Add to `apps/server/src/index.ts` (alongside the existing `mysteriesRoutes` and `playersRoutes` registrations):

```ts
import { cluesRoutes } from "./routes/clues.js";
// ...
await app.register(cluesRoutes, { prefix: "/api" });
```

- [ ] **Step 3: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: build + typecheck clean; vitest reports 14 passed + 1 skipped (no new tests added).

- [ ] **Step 4: Smoke test the endpoints**

```bash
# In one shell:
(cd apps/server && node --env-file=.env dist/src/index.js > /tmp/m4.2.srv.log 2>&1 &)
sleep 3

# Generate a mystery to get a real mystery_id
MID=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"missing-pet","difficulty":"easy"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['mystery_id'])")
echo "mystery: $MID"

# Wait for it to flip to ready (skip this step if you already have a ready mystery)
for i in $(seq 1 30); do
  STATUS=$(curl -sS "http://localhost:3000/api/mysteries/$MID" | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])")
  [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ] && break
  sleep 5
done

# Create a clue
CID=$(curl -sS -X POST "http://localhost:3000/api/mysteries/$MID/clues" \
  -H 'Content-Type: application/json' \
  -d '{"category_type":"character","content":"Suspicious neighbor in blue jacket"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['clue']['id'])")
echo "clue: $CID"

# List clues
curl -sS "http://localhost:3000/api/mysteries/$MID/clues"

# Patch the clue
curl -sS -X PATCH "http://localhost:3000/api/mysteries/$MID/clues/$CID" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Edited content"}'

# Delete it
curl -sS -X DELETE -w "%{http_code}\n" "http://localhost:3000/api/mysteries/$MID/clues/$CID"

kill %1 2>/dev/null; wait 2>/dev/null || true
```
Expected: POST returns `{clue:{...}}` with shortId. GET returns `{clues:[...]}` with the row. PATCH returns updated row. DELETE returns 204.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "$(cat <<'EOF'
M4.2: clues router with create / list / patch / delete

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M4.3: ClueTracker bottom-sheet UI

**Files:**
- Create: `apps/web/src/api/clues.ts`
- Create: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueTracker.tsx`
- Create: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueCategoryTabs.tsx`
- Create: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueEditor.tsx`
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`

**Key deviation from plan §M4.3:** ClueTracker is a fixed-position bottom-sheet (collapsed pill at the viewport bottom, taps expand to a 60vh sheet with backdrop). No `usePlaybackStore` dependency. `audio_timestamp_ms` is omitted from the create call (defaults to `null` server-side). Per the design doc §5.

- [ ] **Step 1: Clues API client**

`apps/web/src/api/clues.ts`:

```ts
import type { Clue, ClueCategoryType } from "@mysterio/shared";
import { api } from "./client.js";

export function listClues(mysteryId: string): Promise<{ clues: Clue[] }> {
  return api(`/api/mysteries/${mysteryId}/clues`);
}

export function createClue(
  mysteryId: string,
  body: { category_type: ClueCategoryType; content: string },
): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues`, { method: "POST", body: JSON.stringify(body) });
}

export function updateClue(mysteryId: string, clueId: string, content: string): Promise<{ clue: Clue }> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}`, { method: "PATCH", body: JSON.stringify({ content }) });
}

export function deleteClue(mysteryId: string, clueId: string): Promise<void> {
  return api(`/api/mysteries/${mysteryId}/clues/${clueId}`, { method: "DELETE" });
}
```

- [ ] **Step 2: ClueCategoryTabs**

`apps/web/src/screens/PlaybackScreen/ClueTracker/ClueCategoryTabs.tsx`:

```tsx
import type { ClueCategoryType } from "@mysterio/shared";

export const CLUE_TABS: { id: ClueCategoryType; label: string }[] = [
  { id: "character", label: "Characters" },
  { id: "item", label: "Items" },
  { id: "location", label: "Locations" },
  { id: "event", label: "Events" },
  { id: "note", label: "Notes" },
];

export function ClueCategoryTabs({
  active,
  onChange,
}: { active: ClueCategoryType; onChange: (t: ClueCategoryType) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4, marginBottom: 8 }}>
      {CLUE_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "none",
            background: active === t.id ? "var(--accent)" : "var(--surface-2)",
            color: active === t.id ? "#1a1530" : "var(--text)",
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: ClueEditor (inline-edit row)**

`apps/web/src/screens/PlaybackScreen/ClueTracker/ClueEditor.tsx`:

```tsx
import { useState } from "react";
import type { Clue } from "@mysterio/shared";

export function ClueEditor({
  clue,
  onSave,
  onDelete,
}: {
  clue: Clue;
  onSave: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clue.content);

  if (editing) {
    return (
      <div style={{ display: "flex", gap: 6, padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid var(--surface)", background: "var(--bg)", color: "var(--text)" }}
        />
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#1a1530", fontWeight: 600, cursor: "pointer" }}
        >Save</button>
        <button
          onClick={() => { setDraft(clue.content); setEditing(false); }}
          style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
        >Cancel</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, background: "var(--surface-2)", borderRadius: 8 }}>
      <span style={{ flex: 1 }}>{clue.content}</span>
      <button
        onClick={() => setEditing(true)}
        style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--text-dim)", fontSize: 13, cursor: "pointer" }}
      >Edit</button>
      <button
        onClick={onDelete}
        style={{ padding: "4px 8px", border: "none", borderRadius: 6, background: "transparent", color: "var(--bad)", fontSize: 13, cursor: "pointer" }}
        aria-label="Delete clue"
      >×</button>
    </div>
  );
}
```

- [ ] **Step 4: ClueTracker (bottom-sheet)**

`apps/web/src/screens/PlaybackScreen/ClueTracker/ClueTracker.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ClueCategoryType } from "@mysterio/shared";
import { createClue, deleteClue, listClues, updateClue } from "../../../api/clues.js";
import { Button } from "../../../components/Button.js";
import { ClueCategoryTabs } from "./ClueCategoryTabs.js";
import { ClueEditor } from "./ClueEditor.js";

export function ClueTracker({ mysteryId }: { mysteryId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ClueCategoryType>("character");
  const [draft, setDraft] = useState("");

  const cluesQ = useQuery({ queryKey: ["clues", mysteryId], queryFn: () => listClues(mysteryId) });

  const createM = useMutation({
    mutationFn: () => createClue(mysteryId, { category_type: activeTab, content: draft.trim() }),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["clues", mysteryId] }); },
  });
  const updateM = useMutation({
    mutationFn: ({ clueId, content }: { clueId: string; content: string }) => updateClue(mysteryId, clueId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId] }),
  });
  const deleteM = useMutation({
    mutationFn: (clueId: string) => deleteClue(mysteryId, clueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clues", mysteryId] }),
  });

  const allClues = cluesQ.data?.clues ?? [];
  const visible = allClues.filter((c) => c.category_type === activeTab);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 20px",
          background: "var(--surface)",
          border: "none",
          borderTop: "2px solid var(--accent)",
          color: "var(--text)",
          fontSize: 15,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          zIndex: 5,
        }}
        aria-label="Open clue tracker"
      >
        <span>
          📝 Clue Tracker{" "}
          <span style={{ color: "var(--text-dim)", fontWeight: 400, fontSize: 13 }}>
            — {allClues.length} {allClues.length === 1 ? "clue" : "clues"}
          </span>
        </span>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>▲ Tap to open</span>
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setExpanded(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10 }}
        aria-hidden="true"
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--surface)",
          borderRadius: "16px 16px 0 0",
          padding: 16,
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 11,
        }}
        role="dialog"
        aria-label="Clue tracker"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Clue Tracker</h3>
          <button
            onClick={() => setExpanded(false)}
            style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 24, cursor: "pointer", padding: 4 }}
            aria-label="Close clue tracker"
          >▼</button>
        </div>
        <ClueCategoryTabs active={activeTab} onChange={setActiveTab} />
        <div style={{ display: "grid", gap: 6, overflowY: "auto", flex: 1, marginBottom: 8 }}>
          {visible.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>{emptyCopy(activeTab)}</p>
          )}
          {visible.map((c) => (
            <ClueEditor
              key={c.id}
              clue={c}
              onSave={(content) => updateM.mutate({ clueId: c.id, content })}
              onDelete={() => deleteM.mutate(c.id)}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a clue..."
            style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid var(--surface-2)", background: "var(--bg)", color: "var(--text)" }}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) createM.mutate(); }}
          />
          <Button disabled={!draft.trim() || createM.isPending} onClick={() => createM.mutate()}>Add</Button>
        </div>
      </div>
    </>
  );
}

function emptyCopy(tab: ClueCategoryType): string {
  switch (tab) {
    case "character": return "Heard about a suspicious character? Add them here.";
    case "item": return "Notice an interesting object? Write it down.";
    case "location": return "A surprising place? Add it here.";
    case "event": return "Something that happened that doesn't add up?";
    case "note": return "Anything else you want to remember.";
  }
}
```

- [ ] **Step 5: Wire into PlaybackScreen**

Modify `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`. Current file is 31 lines and ends with `</div>`. Add the import at the top and `<ClueTracker>` AFTER the closing `</div>` of the existing prose container (the ClueTracker uses `position: fixed`, so it sits on top of the page; padding-bottom on the main container keeps the last paragraph from being hidden by the collapsed pill):

```tsx
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/Button.js";
import { useGenerationJob } from "../../hooks/useGenerationJob.js";
import { ClueTracker } from "./ClueTracker/ClueTracker.js";
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
    <>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", paddingBottom: 80 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back</Link>
          <Link to={`/mysteries/${id}/solve`}><Button>I think I know!</Button></Link>
        </header>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{data.title}</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 16 }}>
          Audio comes later — narrative shown for now.
        </p>
        <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {data.narrative_text}
        </div>
      </div>
      <ClueTracker mysteryId={id!} />
    </>
  );
}
```

- [ ] **Step 6: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 7: Manual smoke test (dev server)**

```bash
pnpm dev
# Open http://localhost:5173 in a desktop browser
# 1. Pick a player → MainScreen → generate a fresh mystery
# 2. On PlaybackScreen, see the collapsed "📝 Clue Tracker — 0 clues" pill at the bottom
# 3. Tap to open → see backdrop + sheet with 5 tabs
# 4. Type a clue, press Enter → row appears
# 5. Tap Edit → inline edit → Save
# 6. Tap × → row deleted
# 7. Switch tabs → other tabs show empty-state copy
# 8. Tap backdrop or ▼ → sheet collapses; count updates
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M4.3: ClueTracker bottom-sheet drawer with 5-tab list and inline add/edit/delete

Bottom-sheet pattern per design spec — collapsed pill at the viewport
bottom expands to a 60vh sheet with backdrop. Audio coupling deferred:
no usePlaybackStore dependency, audio_timestamp_ms always null.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M4.4: solution endpoints + explanationAgent

**Files:**
- Create: `apps/server/src/services/generation/prompts/explanation.system.ts`
- Create: `apps/server/src/services/generation/agents/explanationAgent.ts`
- Create: `apps/server/src/routes/solutions.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Explanation system prompt**

`apps/server/src/services/generation/prompts/explanation.system.ts`:

```ts
export const EXPLANATION_SYSTEM = `You are a kind detective explaining the answer to a mystery for a child age 8-13.

You will receive:
- the LogicStructure of a mystery (with the true answer)
- the kid's guess (or that they gave up)

Output ONLY a single JSON object — no prose, no markdown:

{ "explanation": "<100-150 word friendly paragraph>" }

Rules:
- Walk through the essential clues briefly and how they point at the culprit, the method, and the motive.
- Keep tone warm, never condescending. If they got it right, celebrate. If they got it wrong, be encouraging.
- Avoid the words "essential clue", "logic chain", "JSON", "LogicStructure". Just tell the story of the answer.
- Use the character names, not their ids.`;
```

- [ ] **Step 2: Explanation agent**

`apps/server/src/services/generation/agents/explanationAgent.ts`:

```ts
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { EXPLANATION_SYSTEM } from "../prompts/explanation.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";

const outSchema = z.object({ explanation: z.string().min(50) });

export interface ExplanationInput {
  logicStructure: LogicStructure;
  guess: { who: string | null; how: string | null; why: string | null };
  outcome: "correct" | "partial" | "incorrect" | "gave_up";
}

export async function runExplanation(input: ExplanationInput): Promise<string> {
  let raw: string;
  try {
    raw = await claudeText({
      label: "explanationAgent",
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: EXPLANATION_SYSTEM },
      ],
      user: JSON.stringify({
        logic_structure: input.logicStructure,
        guess: input.guess,
        outcome: input.outcome,
      }, null, 2),
      maxTokens: 512,
      temperature: 0.6,
    });
  } catch {
    return "We'll skip the long explanation this time — but great work taking on the case.";
  }
  try {
    const parsed = outSchema.safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) return "We'll skip the long explanation this time — but great work taking on the case.";
    return parsed.data.explanation;
  } catch {
    return "We'll skip the long explanation this time — but great work taking on the case.";
  }
}
```

(The try/catch wraps both the Claude call AND the JSON parse — matches the M2.6 fail-closed pattern that the code-quality reviewer flagged on graderAgent.)

- [ ] **Step 3: Solutions router**

`apps/server/src/routes/solutions.ts`:

```ts
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runExplanation } from "../services/generation/agents/explanationAgent.js";
import { runGrader } from "../services/generation/agents/graderAgent.js";
import { shortId } from "../utils/ids.js";

const submitBody = z.object({
  guess_who: z.string().min(1),
  guess_how: z.string().min(1).max(400),
  guess_why: z.string().min(1).max(400),
});

export async function solutionsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/submit-solution", async (req, reply) => {
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) { reply.status(400); return { error: "invalid_body", issues: parsed.error.issues }; }
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const existing = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }

    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const who_match = parsed.data.guess_who === ls.true_solution.who_did_it;
    const [howGrade, whyGrade] = await Promise.all([
      runGrader(parsed.data.guess_how, ls.true_solution.how),
      runGrader(parsed.data.guess_why, ls.true_solution.why),
    ]);
    const is_correct = who_match && howGrade.match && whyGrade.match;
    const outcome: "correct" | "partial" | "incorrect" =
      is_correct ? "correct" :
      (who_match || howGrade.match || whyGrade.match) ? "partial" : "incorrect";

    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: parsed.data.guess_who, how: parsed.data.guess_how, why: parsed.data.guess_why },
      outcome,
    });

    const hintRow = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();

    db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      guess_who: parsed.data.guess_who,
      guess_how: parsed.data.guess_how,
      guess_why: parsed.data.guess_why,
      is_correct: is_correct ? 1 : 0,
      who_match: who_match ? 1 : 0,
      how_match: howGrade.match ? 1 : 0,
      why_match: whyGrade.match ? 1 : 0,
      hints_used: hintRow.length,
      gave_up: 0,
      explanation,
    }).run();

    reply.status(201);
    return solutionResponse(myst.id);
  });

  app.post<{ Params: { id: string } }>("/mysteries/:id/give-up", async (req, reply) => {
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const existing = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (existing) { reply.status(409); return { error: "already_solved" }; }
    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const explanation = await runExplanation({
      logicStructure: ls,
      guess: { who: null, how: null, why: null },
      outcome: "gave_up",
    });
    const hintRow = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();
    db.insert(solutions).values({
      id: shortId(),
      mystery_id: myst.id,
      guess_who: null, guess_how: null, guess_why: null,
      is_correct: 0,
      who_match: null, how_match: null, why_match: null,
      hints_used: hintRow.length,
      gave_up: 1,
      explanation,
    }).run();
    reply.status(201);
    return solutionResponse(myst.id);
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/solution", async (req, reply) => {
    const r = solutionResponse(req.params.id);
    if (!r) { reply.status(404); return { error: "not_found" }; }
    return r;
  });
}

function solutionResponse(mysteryId: string) {
  const db = getDb();
  const myst = db.select().from(mysteries).where(eq(mysteries.id, mysteryId)).get();
  if (!myst || !myst.logic_structure_json) return null;
  const sol = db.select().from(solutions).where(eq(solutions.mystery_id, mysteryId)).get();
  const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
  return {
    solution: sol ?? null,
    true_solution: sol ? ls.true_solution : null,
    characters: ls.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description })),
    explanation: sol?.explanation ?? null,
  };
}
```

(Note: `true_solution` is only returned when a solution row exists — kids can't read the answer by polling GET before submitting.)

- [ ] **Step 4: Register router in index**

Add to `apps/server/src/index.ts`:

```ts
import { solutionsRoutes } from "./routes/solutions.js";
// ...
await app.register(solutionsRoutes, { prefix: "/api" });
```

- [ ] **Step 5: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: build + typecheck clean; vitest reports 14 passed + 1 skipped (no new unit tests in this task — explanationAgent is LLM-coupled and follows the M2 agent precedent of integration-only testing).

- [ ] **Step 6: Smoke test (live LLM)**

```bash
(cd apps/server && node --env-file=.env dist/src/index.js > /tmp/m4.4.srv.log 2>&1 &)
sleep 3

# You need a ready mystery. Reuse one or generate fresh.
MID=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"missing-pet","difficulty":"easy"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['mystery_id'])")
for i in $(seq 1 30); do
  STATUS=$(curl -sS "http://localhost:3000/api/mysteries/$MID" | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])")
  echo "$i: $STATUS"
  [ "$STATUS" = "ready" ] && break
  sleep 5
done

# Inspect the characters and pick a wrong suspect (the true culprit will be in ls.true_solution.who_did_it)
curl -sS "http://localhost:3000/api/mysteries/$MID" | python3 -m json.tool | head -40
# Pick a suspect_id from the characters array (not the detective)

# Submit a (likely wrong) guess
curl -sS -X POST "http://localhost:3000/api/mysteries/$MID/submit-solution" \
  -H 'Content-Type: application/json' \
  -d '{"guess_who":"<suspect-id>","guess_how":"They sneaked in through the window","guess_why":"They wanted the trophy"}' \
  | python3 -m json.tool

# GET back the solution
curl -sS "http://localhost:3000/api/mysteries/$MID/solution" | python3 -m json.tool

# Try to submit again — should 409
curl -sS -X POST "http://localhost:3000/api/mysteries/$MID/submit-solution" \
  -H 'Content-Type: application/json' \
  -d '{"guess_who":"x","guess_how":"y","guess_why":"z"}' \
  -w "HTTP %{http_code}\n"

# Test give-up on a FRESH mystery
MID2=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"haunted-mansion","difficulty":"easy"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['mystery_id'])")
for i in $(seq 1 30); do
  STATUS=$(curl -sS "http://localhost:3000/api/mysteries/$MID2" | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])")
  [ "$STATUS" = "ready" ] && break
  sleep 5
done

curl -sS -X POST "http://localhost:3000/api/mysteries/$MID2/give-up" | python3 -m json.tool

kill %1 2>/dev/null; wait 2>/dev/null || true
```
Expected: first submit returns a `solution` row with `is_correct/who_match/how_match/why_match` flags + a 100-150 word `explanation` paragraph. Second submit returns 409 `already_solved`. Give-up returns a solution with `gave_up: 1`, all guess fields null, plus an explanation.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src
git commit -m "$(cat <<'EOF'
M4.4: solutions endpoints (submit, give-up, get) + explanationAgent

Calls compareSolutions-style logic (strict who, grader for how/why),
returns is_correct + partial-match flags, caches a 100-150 word kid-
friendly explanation. Give-up creates a solution row with gave_up=1
and the same cached explanation. true_solution is only returned on
GET once a solution row exists (no peeking).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M4.5: SolutionScreen with character picker, guess form, reveal

**Files:**
- Create: `apps/web/src/api/solutions.ts`
- Create: `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`
- Create: `apps/web/src/screens/SolutionScreen/ClueSummary.tsx`
- Create: `apps/web/src/screens/SolutionScreen/CharacterPicker.tsx`
- Create: `apps/web/src/screens/SolutionScreen/GuessForm.tsx`
- Create: `apps/web/src/screens/SolutionScreen/RevealPanel.tsx`
- Modify: `apps/web/src/routes.tsx`

- [ ] **Step 1: Solutions API client**

`apps/web/src/api/solutions.ts`:

```ts
import type { Solution } from "@mysterio/shared";
import type { PublicCharacter } from "./mysteries.js";
import { api } from "./client.js";

export interface SolutionResponse {
  solution: Solution | null;
  true_solution: { who_did_it: string; how: string; why: string } | null;
  characters: PublicCharacter[];
  explanation: string | null;
}

export function submitSolution(
  mysteryId: string,
  body: { guess_who: string; guess_how: string; guess_why: string },
): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/submit-solution`, { method: "POST", body: JSON.stringify(body) });
}

export function giveUp(mysteryId: string): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/give-up`, { method: "POST" });
}

export function getSolution(mysteryId: string): Promise<SolutionResponse> {
  return api(`/api/mysteries/${mysteryId}/solution`);
}
```

- [ ] **Step 2: ClueSummary**

`apps/web/src/screens/SolutionScreen/ClueSummary.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { listClues } from "../../api/clues.js";
import { CLUE_TABS } from "../PlaybackScreen/ClueTracker/ClueCategoryTabs.js";

export function ClueSummary({ mysteryId }: { mysteryId: string }) {
  const { data } = useQuery({ queryKey: ["clues", mysteryId], queryFn: () => listClues(mysteryId) });
  const clues = data?.clues ?? [];
  return (
    <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)" }}>
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 16 }}>Your clues</h3>
      {clues.length === 0 && (
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13 }}>
          You didn't write any clues. That's OK.
        </p>
      )}
      {CLUE_TABS.map((t) => {
        const list = clues.filter((c) => c.category_type === t.id);
        if (list.length === 0) return null;
        return (
          <div key={t.id} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>{t.label}</div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {list.map((c) => <li key={c.id}>{c.content}</li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: CharacterPicker**

`apps/web/src/screens/SolutionScreen/CharacterPicker.tsx`:

```tsx
import type { PublicCharacter } from "../../api/mysteries.js";

const ROLE_EMOJI: Record<string, string> = {
  detective: "🕵️",
  suspect: "🤔",
  witness: "👀",
  bystander: "🧍",
};

export function CharacterPicker({
  characters,
  selected,
  onSelect,
}: {
  characters: PublicCharacter[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  // The detective is the listener's stand-in — don't show them as a guess option.
  const suspects = characters.filter((c) => c.role !== "detective");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
      {suspects.map((c) => {
        const active = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              padding: 12,
              background: active ? "var(--accent)" : "var(--surface-2)",
              color: active ? "#1a1530" : "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "var(--radius)",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 32 }}>{ROLE_EMOJI[c.role] ?? "🧍"}</div>
            <div style={{ fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{c.role}</div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: GuessForm**

`apps/web/src/screens/SolutionScreen/GuessForm.tsx`:

```tsx
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
```

- [ ] **Step 5: RevealPanel**

`apps/web/src/screens/SolutionScreen/RevealPanel.tsx`:

```tsx
import { Link } from "react-router-dom";
import type { PublicCharacter } from "../../api/mysteries.js";
import type { SolutionResponse } from "../../api/solutions.js";
import { Button } from "../../components/Button.js";

function badgeFor(s: SolutionResponse["solution"]): { label: string; color: string; icon: string } {
  if (!s) return { label: "?", color: "var(--text-dim)", icon: "?" };
  if (s.gave_up) return { label: "You gave up", color: "var(--text-dim)", icon: "🙈" };
  if (s.is_correct) return { label: "Correct!", color: "var(--good)", icon: "✓" };
  const partial = (s.who_match ? 1 : 0) + (s.how_match ? 1 : 0) + (s.why_match ? 1 : 0);
  if (partial > 0) return { label: "Partly right", color: "var(--accent)", icon: "◐" };
  return { label: "Not quite", color: "var(--bad)", icon: "✗" };
}

export function RevealPanel({ data }: { data: SolutionResponse }) {
  const b = badgeFor(data.solution);
  const culprit = data.characters.find((c: PublicCharacter) => c.id === data.true_solution?.who_did_it);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "var(--surface)", padding: 20, borderRadius: "var(--radius)", textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>{b.icon}</div>
        <h2 style={{ color: b.color, margin: 0 }}>{b.label}</h2>
      </div>
      <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)" }}>
        <h3 style={{ marginTop: 0 }}>The answer</h3>
        <p><b>Who:</b> {culprit?.name ?? data.true_solution?.who_did_it ?? "?"}</p>
        <p><b>How:</b> {data.true_solution?.how ?? "?"}</p>
        <p><b>Why:</b> {data.true_solution?.why ?? "?"}</p>
      </div>
      {data.explanation && (
        <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", lineHeight: 1.6 }}>
          {data.explanation}
        </div>
      )}
      <Link to="/"><Button size="lg" style={{ width: "100%" }}>Back to mysteries</Button></Link>
    </div>
  );
}
```

- [ ] **Step 6: SolutionScreen**

`apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`:

```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getMystery } from "../../api/mysteries.js";
import { getSolution, submitSolution } from "../../api/solutions.js";
import { ClueSummary } from "./ClueSummary.js";
import { GuessForm } from "./GuessForm.js";
import { RevealPanel } from "./RevealPanel.js";

export function SolutionScreen() {
  const { id } = useParams<{ id: string }>();
  const mysteryId = id!;

  const mysteryQ = useQuery({ queryKey: ["mystery", mysteryId], queryFn: () => getMystery(mysteryId) });
  const solutionQ = useQuery({ queryKey: ["solution", mysteryId], queryFn: () => getSolution(mysteryId), retry: false });

  const submitM = useMutation({
    mutationFn: (g: { guess_who: string; guess_how: string; guess_why: string }) => submitSolution(mysteryId, g),
    onSuccess: () => { solutionQ.refetch(); },
  });

  if (!mysteryQ.data) return <div style={{ padding: 24 }}>Loading...</div>;
  const characters = mysteryQ.data.characters ?? [];

  const showReveal = solutionQ.data?.solution !== null && solutionQ.data?.solution !== undefined;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", display: "grid", gap: 16 }}>
      <header>
        <Link to={`/mysteries/${mysteryId}`} style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back to story</Link>
        <h1 style={{ marginBottom: 4 }}>{mysteryQ.data.title}</h1>
      </header>

      {!showReveal && <ClueSummary mysteryId={mysteryId} />}
      {!showReveal && (
        <GuessForm
          characters={characters}
          onSubmit={(g) => submitM.mutate(g)}
          pending={submitM.isPending}
        />
      )}
      {showReveal && solutionQ.data && <RevealPanel data={solutionQ.data} />}
    </div>
  );
}
```

- [ ] **Step 7: Replace routes placeholder**

Modify `apps/web/src/routes.tsx`. Currently `/mysteries/:id/solve` renders `<Placeholder name="Solve" />`. Replace the import + the route:

```tsx
import { Navigate, Route, Routes as RRRoutes } from "react-router-dom";
import { MainScreen } from "./screens/MainScreen/MainScreen.js";
import { PlayerPicker } from "./screens/PlayerPicker.js";
import { PlaybackScreen } from "./screens/PlaybackScreen/PlaybackScreen.js";
import { SolutionScreen } from "./screens/SolutionScreen/SolutionScreen.js";
import { usePlayerStore } from "./state/playerStore.js";

function Home() {
  const activePlayerId = usePlayerStore((s) => s.activePlayerId);
  if (!activePlayerId) return <PlayerPicker />;
  return <MainScreen />;
}

export function Routes() {
  return (
    <RRRoutes>
      <Route path="/" element={<Home />} />
      <Route path="/mysteries/:id" element={<PlaybackScreen />} />
      <Route path="/mysteries/:id/solve" element={<SolutionScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </RRRoutes>
  );
}
```

(The `Placeholder` component goes away — it's not used anywhere else.)

- [ ] **Step 8: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 9: Manual smoke test**

```bash
pnpm dev
# Open http://localhost:5173
# 1. Generate or open a ready mystery
# 2. Tap "I think I know!" → SolutionScreen loads
# 3. See ClueSummary (with the clues you added in M4.3) + GuessForm
# 4. Tap a suspect card → it highlights
# 5. Fill how/why textareas
# 6. Submit → spinner ("Checking...") → RevealPanel renders with answer + explanation
# 7. Refresh the page → solution is still cached, reveal still shown
# 8. Try a give-up flow on a fresh mystery via POST (give-up button itself comes in M4.7)
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M4.5: SolutionScreen with ClueSummary, CharacterPicker, GuessForm, RevealPanel

Tap-the-suspect picker excludes the detective. Submit calls grader-backed
endpoint, RevealPanel renders correct/partial/incorrect/gave-up badges
with the cached explanation paragraph. The give-up button itself lands
in M4.7 (HintControls); the give-up endpoint is already wired.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M4.6: hintAgent + hints endpoint (pulled from plan §M5.1)

**Files:**
- Create: `apps/server/src/services/generation/prompts/hint.system.ts`
- Create: `apps/server/src/services/generation/agents/hintAgent.ts`
- Create: `apps/server/src/routes/hints.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Hint system prompt**

`apps/server/src/services/generation/prompts/hint.system.ts`:

```ts
export const HINT_SYSTEM = `You are a gentle detective coach helping a child solve a mystery they're stuck on.

You will receive:
- the LogicStructure of a mystery (with the answer)
- a list of any prior hints already given to the kid

Output ONLY a single JSON object — no prose, no markdown:

{ "hint": "<one sentence>" }

RULES:
- Point at the importance of ONE essential clue without naming the culprit, the method, or the motive.
- Never say a character's name in the hint if they are the culprit.
- Never use the words "answer", "solution", "culprit", "essential clue".
- The hint should make the kid think — not give it away. Tone: gently curious. ("Have you thought about why...?", "Pay close attention to what was found in...", "Whose was that...?")
- Each new hint must point at a DIFFERENT essential clue from any prior hints.
- If all essential clues have already been hinted at, restate the most decisive one differently.`;
```

- [ ] **Step 2: Hint agent**

`apps/server/src/services/generation/agents/hintAgent.ts`:

```ts
import type { LogicStructure } from "@mysterio/shared";
import { z } from "zod";
import { claudeText, extractJson } from "../../anthropic/client.js";
import { HINT_SYSTEM } from "../prompts/hint.system.js";
import { SAFETY_PREAMBLE } from "../prompts/shared.js";

const outSchema = z.object({ hint: z.string().min(5).max(300) });

const FALLBACK = "Re-listen to the part where the detective notices something out of place.";

export async function runHintAgent(input: {
  logicStructure: LogicStructure;
  priorHints: string[];
}): Promise<string> {
  let raw: string;
  try {
    raw = await claudeText({
      label: "hintAgent",
      system: [
        { type: "text", text: SAFETY_PREAMBLE, cache: true },
        { type: "text", text: HINT_SYSTEM },
      ],
      user: JSON.stringify({
        logic_structure: input.logicStructure,
        prior_hints: input.priorHints,
      }, null, 2),
      maxTokens: 256,
      temperature: 0.6,
    });
  } catch {
    return FALLBACK;
  }
  try {
    const parsed = outSchema.safeParse(JSON.parse(extractJson(raw)));
    return parsed.success ? parsed.data.hint : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
```

- [ ] **Step 3: Hints router**

`apps/server/src/routes/hints.ts`:

```ts
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { LogicStructure } from "@mysterio/shared";
import { getDb } from "../db/client.js";
import { hints, mysteries, solutions } from "../db/schema.js";
import { runHintAgent } from "../services/generation/agents/hintAgent.js";
import { shortId } from "../utils/ids.js";

const MAX_HINTS = 2;

export async function hintsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/mysteries/:id/hints", async (req, reply) => {
    const db = getDb();
    const myst = db.select().from(mysteries).where(eq(mysteries.id, req.params.id)).get();
    if (!myst || !myst.logic_structure_json || myst.status !== "ready") {
      reply.status(409); return { error: "mystery_not_ready" };
    }
    const sol = db.select().from(solutions).where(eq(solutions.mystery_id, myst.id)).get();
    if (sol) { reply.status(409); return { error: "already_solved" }; }
    const prior = db.select().from(hints).where(eq(hints.mystery_id, myst.id)).all();
    if (prior.length >= MAX_HINTS) {
      reply.status(409);
      return { error: "hint_limit_reached", limit: MAX_HINTS };
    }

    const ls = JSON.parse(myst.logic_structure_json) as LogicStructure;
    const content = await runHintAgent({
      logicStructure: ls,
      priorHints: prior.map((h) => h.content),
    });

    const id = shortId();
    db.insert(hints).values({ id, mystery_id: myst.id, content }).run();
    const row = db.select().from(hints).where(eq(hints.id, id)).get();
    reply.status(201);
    return { hint: row, remaining: MAX_HINTS - (prior.length + 1) };
  });

  app.get<{ Params: { id: string } }>("/mysteries/:id/hints", async (req) => {
    const db = getDb();
    const rows = db.select().from(hints).where(eq(hints.mystery_id, req.params.id)).all();
    return { hints: rows, remaining: Math.max(0, MAX_HINTS - rows.length) };
  });
}
```

- [ ] **Step 4: Register router in index**

```ts
import { hintsRoutes } from "./routes/hints.js";
// ...
await app.register(hintsRoutes, { prefix: "/api" });
```

- [ ] **Step 5: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: all clean; 14 tests + 1 skipped.

- [ ] **Step 6: Live smoke test**

```bash
(cd apps/server && node --env-file=.env dist/src/index.js > /tmp/m4.6.srv.log 2>&1 &)
sleep 3

# Use a ready mystery without a solution yet — fresh generation:
MID=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"locked-room","difficulty":"medium"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['mystery_id'])")
for i in $(seq 1 30); do
  STATUS=$(curl -sS "http://localhost:3000/api/mysteries/$MID" | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])")
  [ "$STATUS" = "ready" ] && break
  sleep 5
done

# Request 1st hint
curl -sS -X POST "http://localhost:3000/api/mysteries/$MID/hints" | python3 -m json.tool

# Request 2nd hint
curl -sS -X POST "http://localhost:3000/api/mysteries/$MID/hints" | python3 -m json.tool

# Request 3rd — should 409 hint_limit_reached
curl -sS -X POST "http://localhost:3000/api/mysteries/$MID/hints" -w "HTTP %{http_code}\n"

# Listing
curl -sS "http://localhost:3000/api/mysteries/$MID/hints" | python3 -m json.tool

kill %1 2>/dev/null; wait 2>/dev/null || true
```
Expected: 1st returns `{hint:{...}, remaining: 1}`. 2nd returns `{hint:{...}, remaining: 0}`. 3rd returns 409 with `hint_limit_reached`. The two hints should point at DIFFERENT essential clues (read both and confirm they don't restate the same one) — if they do, that's a prompt-tuning concern to flag but not a blocker (the prompt already says "DIFFERENT essential clue").

- [ ] **Step 7: Commit**

```bash
git add apps/server/src
git commit -m "$(cat <<'EOF'
M4.6: hintAgent + POST/GET hints endpoints with 2-hint cap

Pulled forward from original plan §M5.1. hintAgent is fail-soft —
falls back to a generic prompt-to-re-listen on LLM/parse failure.
Server enforces ≤2 hints per mystery; third POST returns 409.
Hint requests are blocked once a solution row exists.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M4.7: HintControls on SolutionScreen (pulled from plan §M5.2)

**Files:**
- Create: `apps/web/src/api/hints.ts`
- Create: `apps/web/src/screens/SolutionScreen/HintControls.tsx`
- Modify: `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`

- [ ] **Step 1: Hints API client**

`apps/web/src/api/hints.ts`:

```ts
import type { Hint } from "@mysterio/shared";
import { api } from "./client.js";

export function listHints(mysteryId: string): Promise<{ hints: Hint[]; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints`);
}

export function requestHint(mysteryId: string): Promise<{ hint: Hint; remaining: number }> {
  return api(`/api/mysteries/${mysteryId}/hints`, { method: "POST" });
}
```

- [ ] **Step 2: HintControls component**

`apps/web/src/screens/SolutionScreen/HintControls.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listHints, requestHint } from "../../api/hints.js";
import { giveUp } from "../../api/solutions.js";
import { Button } from "../../components/Button.js";

export function HintControls({ mysteryId, onGaveUp }: { mysteryId: string; onGaveUp: () => void }) {
  const qc = useQueryClient();
  const hintsQ = useQuery({ queryKey: ["hints", mysteryId], queryFn: () => listHints(mysteryId) });
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  const askHint = useMutation({
    mutationFn: () => requestHint(mysteryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hints", mysteryId] }),
  });

  const giveUpM = useMutation({
    mutationFn: () => giveUp(mysteryId),
    onSuccess: () => onGaveUp(),
  });

  const remaining = hintsQ.data?.remaining ?? 2;
  const hintList = hintsQ.data?.hints ?? [];

  return (
    <div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)" }}>
      <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 16 }}>Need a hint?</h3>
      {hintList.length > 0 && (
        <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
          {hintList.map((h) => <li key={h.id} style={{ marginBottom: 4 }}>{h.content}</li>)}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button
          variant="secondary"
          disabled={remaining === 0 || askHint.isPending}
          onClick={() => askHint.mutate()}
        >
          {askHint.isPending ? "Thinking..." : (remaining === 0 ? "All hints used" : `Give me a clue (${remaining} left)`)}
        </Button>
        {!confirmGiveUp ? (
          <Button variant="ghost" onClick={() => setConfirmGiveUp(true)}>I give up — tell me</Button>
        ) : (
          <>
            <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Sure? This will reveal the answer.</span>
            <Button variant="secondary" disabled={giveUpM.isPending} onClick={() => giveUpM.mutate()}>
              {giveUpM.isPending ? "Revealing..." : "Yes, reveal"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmGiveUp(false)}>Keep trying</Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire HintControls into SolutionScreen**

Modify `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx` — add the import and render HintControls between ClueSummary and GuessForm:

```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getMystery } from "../../api/mysteries.js";
import { getSolution, submitSolution } from "../../api/solutions.js";
import { ClueSummary } from "./ClueSummary.js";
import { GuessForm } from "./GuessForm.js";
import { HintControls } from "./HintControls.js";
import { RevealPanel } from "./RevealPanel.js";

export function SolutionScreen() {
  const { id } = useParams<{ id: string }>();
  const mysteryId = id!;

  const mysteryQ = useQuery({ queryKey: ["mystery", mysteryId], queryFn: () => getMystery(mysteryId) });
  const solutionQ = useQuery({ queryKey: ["solution", mysteryId], queryFn: () => getSolution(mysteryId), retry: false });

  const submitM = useMutation({
    mutationFn: (g: { guess_who: string; guess_how: string; guess_why: string }) => submitSolution(mysteryId, g),
    onSuccess: () => { solutionQ.refetch(); },
  });

  if (!mysteryQ.data) return <div style={{ padding: 24 }}>Loading...</div>;
  const characters = mysteryQ.data.characters ?? [];

  const showReveal = solutionQ.data?.solution !== null && solutionQ.data?.solution !== undefined;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", display: "grid", gap: 16 }}>
      <header>
        <Link to={`/mysteries/${mysteryId}`} style={{ color: "var(--text-dim)", textDecoration: "none" }}>← Back to story</Link>
        <h1 style={{ marginBottom: 4 }}>{mysteryQ.data.title}</h1>
      </header>

      {!showReveal && <ClueSummary mysteryId={mysteryId} />}
      {!showReveal && <HintControls mysteryId={mysteryId} onGaveUp={() => solutionQ.refetch()} />}
      {!showReveal && (
        <GuessForm characters={characters} onSubmit={(g) => submitM.mutate(g)} pending={submitM.isPending} />
      )}
      {showReveal && solutionQ.data && <RevealPanel data={solutionQ.data} />}
    </div>
  );
}
```

- [ ] **Step 4: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 5: Manual smoke test (full kid-loop)**

```bash
pnpm dev
# Open http://localhost:5173
# 1. Pick a player → generate a fresh mystery
# 2. On PlaybackScreen, open ClueTracker bottom-sheet → add 1-2 clues across 2+ tabs
# 3. Tap "I think I know!" → SolutionScreen
# 4. See ClueSummary + HintControls + GuessForm in that order
# 5. Tap "Give me a clue (2 left)" → spinner → hint appears in the list, button now shows "(1 left)"
# 6. Tap again → hint #2 appears, button now disabled with "All hints used"
# 7. Pick a suspect, fill how/why, submit → RevealPanel
# 8. ON A FRESH MYSTERY: same flow but tap "I give up — tell me" → confirmation → "Yes, reveal" → RevealPanel with "🙈 You gave up" badge
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M4.7: HintControls with 2-tier hint flow (nudge + give-up confirmation)

Pulled forward from original plan §M5.2. "Give me a clue (N left)"
button calls hint endpoint, disables at 0. "I give up — tell me" has
a single confirm step before calling /give-up and refetching the
solution. All requested hints stay visible above the form.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M4.8 (verification only): Deploy M4 to VM + full kid-loop walkthrough

**Files:** none (verification milestone)

- [ ] **Step 1: Deploy**

```bash
bash scripts/deploy.sh
```
Expected: build → rsync → install → migrate → restart → health check passes. (The pnpm `deploy` subcommand collision is still present — use `bash scripts/deploy.sh` directly, not `pnpm deploy`.)

- [ ] **Step 2: iPad smoke test on https://panther-golem.exe.xyz/**

Walk through the full kid-loop on a real iPad (or iPad Safari simulator on macOS):

1. Pick player P1 or P2.
2. Generate a fresh Easy mystery.
3. Wait for it to flip to ready (~90s).
4. Read the narrative on PlaybackScreen.
5. Open the ClueTracker bottom-sheet → add at least one clue in 2 different categories.
6. Edit one clue, delete another.
7. Close the sheet (tap backdrop or chevron).
8. Tap "I think I know!" → SolutionScreen.
9. Tap "Give me a clue (2 left)" → see hint appear; counter → 1.
10. Pick a suspect, fill how/why, submit.
11. See RevealPanel — verify the badge matches the outcome (correct / partial / not-quite), the answer renders the suspect's NAME (not id), and the explanation paragraph is 100-150 words and reads as kid-friendly.
12. On a second mystery, do the give-up flow: tap "I give up — tell me" → confirm → see the gave-up reveal.

- [ ] **Step 3: Mark M4 acceptance pass + push design-doc updates if needed**

If anything in the smoke test was off, surface as DONE_WITH_CONCERNS before moving to M3-audio. Otherwise, M4 is done; next milestone is M3.3-new (OpenAI TTS provider) per the deferred-audio sequence.

---

## Self-Review

Checked against `docs/superpowers/specs/2026-05-16-m4-with-hints-design.md`:

| Spec section | Implementation |
|---|---|
| §2.1 Clue tracker (5 categories, CRUD) | M4.2 router, M4.3 UI |
| §2.2 Solution flow (picker + form + reveal) | M4.4 endpoints + explanationAgent, M4.5 SolutionScreen |
| §2.3 Hint system (≤2 nudges + give-up) | M4.6 hintAgent + 2-cap endpoint, M4.7 HintControls + give-up confirm |
| §3 Task ordering (7 tasks) | M4.1-M4.7 match exactly; M4.8 added as verification-only |
| §4 Backend routes + agents | All 7 routes wired; both agents fail-soft |
| §5 Frontend (ClueTracker bottom-sheet, SolutionScreen sections) | M4.3 bottom-sheet, M4.5 SolutionScreen with HintControls between ClueSummary + GuessForm per design §5 |
| §6 Hint accounting (`hints_used` from count at solution-create) | M4.4 step 3 lines 33-34 of solutions.ts |
| §6 One solution per mystery (409 on resubmit) | M4.4 step 3 lines 14-15, 38-39 of solutions.ts |
| §7 Acceptance walkthrough | M4.8 step 2 mirrors the 6-point acceptance |
| §8 Out-of-scope (TranscriptPanel / audio_timestamp / AudioPlayer) | All deliberately omitted; ClueTracker takes no audio import |

Plan failures scan (per writing-plans skill):
- No "TBD" / "implement later" / "appropriate error handling" / "similar to Task N".
- All endpoints, types, functions, and imports are defined in earlier tasks before being referenced.
- Method names consistent: `runGrader` (not `runGraderAgent`), `runExplanation`, `runHintAgent`. `shortId` not `nanoid`. `createClue / updateClue / deleteClue / listClues`. `submitSolution / giveUp / getSolution`. `requestHint / listHints`.
- `.js` import extensions throughout (project ESM convention).
- Commit-message Co-Authored-By trailer is `Claude Sonnet 4.6` (matches repo's existing history).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-16-m4-implementation.md`.

**Per user directive (2026-05-16 session):** Start the implementation in a **fresh session** to keep context clean. The next session should:

1. Resume from this branch (`feat/mysterio-implementation`).
2. Read `docs/superpowers/SESSION_STATE.md` for project state.
3. Read this plan (`docs/superpowers/plans/2026-05-16-m4-implementation.md`).
4. Invoke `superpowers:subagent-driven-development` to begin with **Task M4.1**.
5. Use sonnet for implementer and reviewer subagents.
6. Per-task workflow: implementer → spec compliance review → code quality review → fix → re-review (every prior M2/M3 reviewer found a real bug; don't skip).

After all 7 implementation tasks (M4.1-M4.7) land cleanly, run M4.8 (deploy + iPad smoke) to gate the move to M3.3-new (OpenAI TTS provider + audio storage).
