# M5a Implementation Plan — Player-name detective + main-page hero + briefing card

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the kid the detective in every mystery (player name → detective character), greet them as such on the main page, and frame the case explicitly with a briefing card + cast roster before the narrative starts.

**Architecture:** Three small changes — (1) a `playerName` field flows from the route through the orchestrator into the LogicStructure agent so Claude names the detective after the player; (2) MainScreen gains a 5-line hero greeting; (3) PlaybackScreen renders a new `BriefingCard` component as a gate before the existing narrative + ClueTracker. No DB migrations. No new endpoints.

**Tech Stack:** Fastify 5, Drizzle (better-sqlite3), Anthropic SDK 0.96.0, Zod 3, React 18 + Vite, TanStack Query 5, React Router 6, vitest.

**Source spec:** `docs/superpowers/specs/2026-05-17-m5-kid-onboarding-design.md` (approved 2026-05-17).

**Continue using:** sonnet for implementer + reviewer subagents (per `workflow_model_selection` memory); per-task review pattern of implementer → spec compliance → code quality → fix → re-review (per `workflow_subagent_driven` memory) — reviewers found a real bug in 4/7 M4 tasks.

---

## Task M5a.1: playerName through generation pipeline + LogicStructure prompt rule

**Files:**
- Modify: `apps/server/src/routes/mysteries.ts`
- Modify: `apps/server/src/services/generation/orchestrator.ts`
- Modify: `apps/server/src/services/generation/agents/logicStructureAgent.ts`
- Modify: `apps/server/src/services/generation/prompts/logicStructure.system.ts`

- [ ] **Step 1: Route fetches player name and passes it to the orchestrator**

In `apps/server/src/routes/mysteries.ts`, the POST `/mysteries/generate` handler currently inserts the mystery row and calls `runGeneration({ mysteryId, category, difficulty })`. Add a lookup for the player's display name and pass it as `playerName`.

Add `players` to the schema imports at the top:

```ts
import { mysteries, players } from "../db/schema.js";
```

Replace the body of the POST handler with:

```ts
app.post("/mysteries/generate", async (req, reply) => {
  const parsed = generateBody.safeParse(req.body);
  if (!parsed.success) {
    reply.status(400);
    return { error: "invalid_body", issues: parsed.error.issues };
  }
  const db = getDb();
  const player = db.select().from(players).where(eq(players.id, parsed.data.player_id)).get();
  if (!player) {
    reply.status(404);
    return { error: "player_not_found" };
  }
  const id = mysteryId();
  db.insert(mysteries).values({
    id,
    player_id: parsed.data.player_id,
    category: parsed.data.category,
    difficulty: parsed.data.difficulty,
    status: "pending",
  }).run();

  void runGeneration({
    mysteryId: id,
    category: parsed.data.category,
    difficulty: parsed.data.difficulty,
    playerName: player.name,
  });

  reply.status(202);
  return { mystery_id: id, status: "pending" };
});
```

- [ ] **Step 2: Orchestrator threads playerName to the LogicStructure agent**

In `apps/server/src/services/generation/orchestrator.ts`:

- Add `playerName: string` to the `RunInput` interface (right after `difficulty`).
- In `regenLoop`, pass it into `runLogicStructureAgent({ ..., playerName: input.playerName })`.

The full updated `RunInput` and the changed agent call:

```ts
interface RunInput {
  mysteryId: string;
  category: CategoryId;
  difficulty: DifficultyId;
  playerName: string;
}
```

```ts
const logicRes = await runLogicStructureAgent({
  category: input.category,
  difficulty: input.difficulty,
  playerName: input.playerName,
  previousFailureNotes,
});
```

No other changes to orchestrator.ts.

- [ ] **Step 3: LogicStructure agent accepts and forwards playerName**

In `apps/server/src/services/generation/agents/logicStructureAgent.ts`:

- Add `playerName: string` to the `LogicStructureAgentInput` interface.
- Pass it into `buildUserMessage` so it reaches the Claude user message.

Updated interface:

```ts
export interface LogicStructureAgentInput {
  category: CategoryId;
  difficulty: DifficultyId;
  playerName: string;
  previousFailureNotes?: string;
}
```

Updated `buildUserMessage` (full replacement):

```ts
function buildUserMessage(input: LogicStructureAgentInput, lastError?: string): string {
  const base = `Generate a ${input.difficulty} ${input.category} mystery. The detective character's name MUST be exactly: ${input.playerName}.`;
  if (input.previousFailureNotes) {
    const parseNote = lastError ? `\n\nNote: your most recent JSON output also had a structural problem: ${lastError}` : "";
    return `${base}\n\nYour previous attempt failed validation. Fix these issues:\n${input.previousFailureNotes}${parseNote}`;
  }
  if (lastError) {
    return `${base}\n\nYour previous output had a problem: ${lastError}\nReturn a corrected JSON object that satisfies the schema exactly.`;
  }
  return base;
}
```

(The detective-name instruction is now in every attempt's user message, including retry attempts.)

- [ ] **Step 4: LogicStructure system prompt adds the detective rule**

In `apps/server/src/services/generation/prompts/logicStructure.system.ts`, find the existing `DESIGN RULES:` section. Add a new rule as the first bullet under DESIGN RULES (immediately after the header), keeping the existing bullets in place:

```
DESIGN RULES:
- DETECTIVE CHARACTER: exactly one character has role "detective". Their name MUST match the name provided in the user message — do not invent a different name. They are age 10, the listener's stand-in: curious, observant, carries a notebook everywhere. They are NEVER the culprit. Their description (2-3 sentences) should make a kid feel like that detective is them.
- The mystery MUST be solvable from the essential_clues alone, by a careful eight-year-old, without ever needing the false_clues or off-screen knowledge.
- Spread coverage across clues: collectively they must support deducing who, how, AND why. Individual clues should cover different aspects.
...
```

(Keep all existing DESIGN RULES bullets and the CLUE OBFUSCATION section unchanged.)

- [ ] **Step 5: Build + typecheck + tests**

```bash
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/server typecheck
pnpm --filter @mysterio/server test
```
Expected: build + typecheck clean; vitest reports 14 passed + 1 skipped (no new tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src
git commit -m "$(cat <<'EOF'
M5a.1: thread playerName through generation pipeline; LLM names detective after the player

Route POST /mysteries/generate now looks up the player by id and
passes the player name into runGeneration. Orchestrator forwards
it to runLogicStructureAgent, which inlines it into the user message
so Claude must use that exact name as the detective character. The
system prompt also gets a DESIGN RULE pinning detective shape (age
10, listener stand-in, never the culprit).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5a.2: Main-page hero on MainScreen

**Files:**
- Modify: `apps/web/src/screens/MainScreen/MainScreen.tsx`

The current MainScreen header (around lines 32-40) shows "Mysterio" + a "Switch player" button. We're not changing that. We're adding a small hero block BELOW the header but ABOVE the first `<section>` ("Pick a mystery").

- [ ] **Step 1: Add hero block**

In `apps/web/src/screens/MainScreen/MainScreen.tsx`, find the existing block:

```tsx
      </header>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Pick a mystery</h2>
```

Insert a hero block in between:

```tsx
      </header>

      <div
        style={{
          background: "var(--surface)",
          padding: 16,
          borderRadius: "var(--radius)",
          borderLeft: "3px solid var(--accent)",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Welcome back
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
          Detective {player?.name ?? "Detective"} 🕵️
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Pick a mystery</h2>
```

(The fallback "Detective" in `player?.name ?? "Detective"` covers the brief moment between the route loading and the `useQuery(listPlayers)` resolving.)

- [ ] **Step 2: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M5a.2: main-page hero — "Welcome back, Detective <name> 🕵️"

Adds a small hero block on MainScreen above the "Pick a mystery"
section. Reuses the existing player lookup; gracefully falls back
to "Detective" if the players query hasn't resolved yet.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5a.3: BriefingCard component + integration into PlaybackScreen

**Files:**
- Create: `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`

- [ ] **Step 1: BriefingCard component**

Create `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`:

```tsx
import type { PublicCharacter, MysteryDetail } from "../../../api/mysteries.js";
import { Button } from "../../../components/Button.js";

const CATEGORY_EMOJI: Record<string, string> = {
  "missing-pet": "🐾",
  "haunted-mansion": "👻",
  "stolen-treasure": "💎",
  "locked-room": "🔐",
};

const ROLE_BADGE: Record<string, { emoji: string; label: string; color: string }> = {
  detective: { emoji: "🕵️", label: "You", color: "var(--accent)" },
  suspect:   { emoji: "🤔", label: "Suspect", color: "var(--bad)" },
  witness:   { emoji: "👀", label: "Witness", color: "#9ad4ff" },
  bystander: { emoji: "🧍", label: "Bystander", color: "var(--text-dim)" },
};

export function BriefingCard({
  mystery,
  onStart,
}: {
  mystery: MysteryDetail;
  onStart: () => void;
}) {
  const characters: PublicCharacter[] = mystery.characters ?? [];
  const detective = characters.find((c) => c.role === "detective");
  const others = characters.filter((c) => c.role !== "detective");
  const icon = CATEGORY_EMOJI[mystery.category] ?? "🔎";

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          padding: 24,
          border: "2px solid var(--accent)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48 }}>{icon}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-dim)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 8,
          }}
        >
          Today's case
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
          {mystery.title ?? "Untitled Mystery"}
        </div>
        <div style={{ fontSize: 14, color: "var(--text)", margin: "16px 0", lineHeight: 1.5 }}>
          Your job: figure out <b>who</b> did it, <b>how</b>, and <b>why</b>.
        </div>

        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "left",
            margin: "16px 0 6px",
          }}
        >
          You'll meet
        </div>
        <div style={{ display: "grid", gap: 4, textAlign: "left" }}>
          {detective && (
            <CastRow
              emoji={ROLE_BADGE.detective.emoji}
              label={ROLE_BADGE.detective.label}
              labelColor={ROLE_BADGE.detective.color}
              name={`Detective ${detective.name}`}
            />
          )}
          {others.map((c) => {
            const badge = ROLE_BADGE[c.role] ?? ROLE_BADGE.bystander;
            return (
              <CastRow
                key={c.id}
                emoji={badge.emoji}
                label={badge.label}
                labelColor={badge.color}
                name={c.name}
              />
            );
          })}
        </div>

        <Button size="lg" onClick={onStart} style={{ width: "100%", marginTop: 20 }}>
          📖 Start the story
        </Button>
      </div>
    </div>
  );
}

function CastRow({
  emoji, label, labelColor, name,
}: { emoji: string; label: string; labelColor: string; name: string }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 13,
        color: "var(--text)",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span>{emoji}</span>
      <span style={{ color: labelColor, fontWeight: 600 }}>{label}</span>
      <span style={{ color: "var(--text-dim)" }}>—</span>
      <span>{name}</span>
    </div>
  );
}
```

- [ ] **Step 2: Wire BriefingCard into PlaybackScreen**

Modify `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`. Add `useState` import, a `started` state, and the BriefingCard render before the existing prose layout.

Full replacement of the file:

```tsx
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/Button.js";
import { useGenerationJob } from "../../hooks/useGenerationJob.js";
import { BriefingCard } from "./BriefingCard/BriefingCard.js";
import { ClueTracker } from "./ClueTracker/ClueTracker.js";
import { FailedMystery } from "./FailedMystery.js";
import { LoadingMystery } from "./LoadingMystery.js";

export function PlaybackScreen() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGenerationJob(id!);
  const [started, setStarted] = useState(false);

  if (isLoading || !data) return <LoadingMystery status="pending" />;
  if (isError) return <FailedMystery reason={null} />;
  if (data.status === "failed") return <FailedMystery reason={data.failure_reason} />;
  if (data.status !== "ready") return <LoadingMystery status={data.status} />;

  if (!started) {
    return <BriefingCard mystery={data} onStart={() => setStarted(true)} />;
  }

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

- [ ] **Step 3: Build + typecheck**

```bash
pnpm --filter @mysterio/web build
pnpm --filter @mysterio/web typecheck
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
M5a.3: BriefingCard — title + cast roster + Start gate before the narrative

PlaybackScreen now renders a centered briefing card when the mystery
is ready: category emoji, "Today's case" + title, the "who/how/why"
goal, and a "You'll meet" roster with role-badged rows (🕵️ You /
🤔 Suspect / 👀 Witness / 🧍 Bystander). Tapping "Start the story"
reveals the existing narrative + ClueTracker layout. State is
component-local (no persistence) so a refresh re-orients the kid.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task M5a.4: Live-LLM verification (two fresh generations)

**Files:** none (verification milestone)

This is an end-to-end smoke test the controller runs locally before the deploy. It costs ~2 × $0.04 = $0.08 in Claude calls.

- [ ] **Step 1: Build and boot the server**

```bash
pnpm --filter @mysterio/shared build
pnpm --filter @mysterio/server build
pnpm --filter @mysterio/web build
(cd apps/server && node --env-file=.env dist/src/index.js > /tmp/m5a.srv.log 2>&1 &)
sleep 3
curl -sS http://localhost:3000/api/health
```
Expected: `{"ok":true,"db":true}`.

- [ ] **Step 2: Confirm player names in DB**

```bash
sqlite3 data/mysterio.db "SELECT id, name FROM players;"
```
Expected: two rows. Note the names — those should appear as the detective character names in the next step.

- [ ] **Step 3: Generate a fresh missing-pet mystery for the first player**

```bash
MID=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"missing-pet","difficulty":"easy"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['mystery_id'])")
echo "$MID"
for i in $(seq 1 36); do
  STATUS=$(curl -sS "http://localhost:3000/api/mysteries/$MID" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))" 2>/dev/null)
  printf "[%2d] %s\n" "$i" "$STATUS"
  if [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 5
done
```
Expected: status flips pending → generating_logic → validating → writing → ready in 60-120s. If "failed", investigate /tmp/m5a.srv.log.

- [ ] **Step 4: Verify detective name = p1's player name**

```bash
python3 <<EOF
import sqlite3, json
con = sqlite3.connect("data/mysterio.db")
row = con.execute("SELECT logic_structure_json FROM mysteries WHERE id='$MID'").fetchone()
ls = json.loads(row[0])
p1 = con.execute("SELECT name FROM players WHERE id='p1'").fetchone()[0]
detective = next(c for c in ls['characters'] if c['role'] == 'detective')
print(f"player p1 name: {p1}")
print(f"detective character name: {detective['name']}")
print(f"detective description: {detective['description']}")
print(f"MATCH: {p1 == detective['name']}")
EOF
```
Expected: `MATCH: True`. The detective description should mention curiosity / notebook / observer.

- [ ] **Step 5: Generate a second mystery in a different category**

```bash
MID2=$(curl -sS -X POST http://localhost:3000/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p2","category":"locked-room","difficulty":"easy"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['mystery_id'])")
echo "$MID2"
for i in $(seq 1 36); do
  STATUS=$(curl -sS "http://localhost:3000/api/mysteries/$MID2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))" 2>/dev/null)
  printf "[%2d] %s\n" "$i" "$STATUS"
  if [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 5
done

python3 <<EOF
import sqlite3, json
con = sqlite3.connect("data/mysterio.db")
row = con.execute("SELECT logic_structure_json FROM mysteries WHERE id='$MID2'").fetchone()
ls = json.loads(row[0])
p2 = con.execute("SELECT name FROM players WHERE id='p2'").fetchone()[0]
detective = next(c for c in ls['characters'] if c['role'] == 'detective')
print(f"player p2 name: {p2}, detective: {detective['name']}, MATCH: {p2 == detective['name']}")
EOF
```
Expected: `MATCH: True`.

- [ ] **Step 6: Verify the BriefingCard renders correctly in a desktop browser**

```bash
# Web dev server (Vite) — separate terminal/background
(cd apps/web && npx vite --host 127.0.0.1 --port 5173 > /tmp/m5a.vite.log 2>&1 &)
sleep 4
# In a browser: http://127.0.0.1:5173/mysteries/<MID>
echo "open http://127.0.0.1:5173/mysteries/$MID"
```

Manually verify:
1. MainScreen at `/` shows "Welcome back, Detective <p1's name> 🕵️" above the "Pick a mystery" grid.
2. PlaybackScreen at `/mysteries/$MID` shows the BriefingCard FIRST: title from $MID, "Your job" line, "You'll meet" roster with `🕵️ You — Detective <p1's name>` plus the other characters labeled Suspect/Witness/Bystander, and a "📖 Start the story" button.
3. Tapping "Start the story" reveals the existing narrative + ClueTracker bottom-sheet pill.
4. Refresh the page → BriefingCard is shown again (no persistence, intentional).

- [ ] **Step 7: Stop the local servers**

```bash
pkill -f "node --env-file=.env dist/src/index.js" 2>/dev/null
pkill -f "vite --host 127.0.0.1 --port 5173" 2>/dev/null
sleep 1
```

- [ ] **Step 8: Mark verification PASSED and proceed to deploy**

If any step failed, surface as DONE_WITH_CONCERNS rather than DONE. Common failure modes:
- Detective name doesn't match → re-check the user-message wrapping in `logicStructureAgent.ts` and the system-prompt rule
- "Player not found" 404 → ensure `players` table is seeded (`pnpm --filter @mysterio/server db:seed`)
- BriefingCard renders but Start button is broken → check `useState` import + the conditional render order in PlaybackScreen.tsx

---

## Task M5a.5: Deploy to panther-golem.exe.xyz + iPad smoke handoff

**Files:** none (deploy + verify)

- [ ] **Step 1: Deploy**

```bash
bash scripts/deploy.sh
```
Expected: build → rsync → install → migrate → restart → health check passes (returns `{"ok":true,"db":true}`).

- [ ] **Step 2: Remote spot-check**

```bash
echo "=== MainScreen HTML loads ==="
curl -sS https://panther-golem.exe.xyz/ -o /dev/null -w "HTTP %{http_code}\n"

echo "=== Players API still works ==="
curl -sS https://panther-golem.exe.xyz/api/players | python3 -m json.tool

echo "=== Generate a fresh mystery to verify the prompt change is in prod ==="
MID=$(curl -sS -X POST https://panther-golem.exe.xyz/api/mysteries/generate \
  -H 'Content-Type: application/json' \
  -d '{"player_id":"p1","category":"missing-pet","difficulty":"easy"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['mystery_id'])")
echo "MID: $MID"
for i in $(seq 1 36); do
  STATUS=$(curl -sS "https://panther-golem.exe.xyz/api/mysteries/$MID" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))" 2>/dev/null)
  printf "[%2d] %s\n" "$i" "$STATUS"
  if [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 5
done

echo "=== Inspect the remote detective name (via API) ==="
curl -sS "https://panther-golem.exe.xyz/api/mysteries/$MID" | python3 -c "
import json, sys
d = json.load(sys.stdin)
det = next((c for c in (d.get('characters') or []) if c.get('role') == 'detective'), None)
print('detective:', det)
"
```
Expected: 200s, mystery flips to `ready`, the detective character's `name` field equals "Player One" (the p1 player name).

- [ ] **Step 3: iPad handoff**

Hand the URL to the user with a checklist:

```
Live at https://panther-golem.exe.xyz/

iPad walkthrough (M5a):
1. Pick player P1 (or P2).
2. Confirm "Welcome back, Detective Player One 🕵️" appears at the top.
3. Generate a fresh Easy missing-pet mystery, wait ~90s for it to flip to ready.
4. On the PlaybackScreen URL, confirm the BriefingCard shows FIRST:
   - the category emoji (🐾)
   - "Today's case" + the LLM title
   - "Your job: who / how / why"
   - cast roster with "🕵️ You — Detective Player One" and the suspects/witnesses with correct badges
   - "📖 Start the story" button
5. Tap "Start" → narrative + clue tracker pill appear.
6. Refresh the page → BriefingCard re-appears (intentional re-orientation).
7. Sanity: tap into the clue tracker, add a note, navigate to /solve, submit a guess.

If anything is off, report back so we can iterate before M5b (annotated narrative).
```

- [ ] **Step 4: Mark M5a complete and queue M5b for after user iPad feedback**

M5b implementation begins only after the user confirms M5a's identity + briefing flow feels right on iPad. See `docs/superpowers/specs/2026-05-17-m5-kid-onboarding-design.md` § "M5b" for the full scope.

---

## Self-Review

Checked against `docs/superpowers/specs/2026-05-17-m5-kid-onboarding-design.md`:

| Spec section | Implementation |
|---|---|
| §M5a.1 player name → LLM detective | Task M5a.1 (route → orchestrator → agent → prompt) |
| §M5a.2 main-page hero | Task M5a.2 |
| §M5a.3 BriefingCard + integration | Task M5a.3 |
| Acceptance: detective name = player name (verified) | Task M5a.4 step 4 + step 5 |
| Acceptance: hero greets the player | Task M5a.4 step 6 (manual browser check) |
| Acceptance: BriefingCard renders cast | Task M5a.4 step 6 (manual browser check) |
| Acceptance: deployed and iPad-tested | Tasks M5a.5 step 1-3 |

Plan failures scan (per writing-plans skill):
- No "TBD" / "implement later" / "appropriate error handling" / "similar to Task N".
- All endpoints, types, functions, and imports are defined in earlier tasks before being referenced.
- `MysteryDetail` / `PublicCharacter` (referenced in BriefingCard) are already exported from `apps/web/src/api/mysteries.ts` (existing M4 work).
- Method names consistent: `runLogicStructureAgent`, `runGeneration`, `runNarrativeAgent`. `BriefingCard` not `CaseBriefing` or `BriefingPanel`.
- `.js` import extensions throughout (project ESM convention).
- Commit-message Co-Authored-By trailer is `Claude Sonnet 4.6` (matches repo's existing history).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-m5a-implementation.md`. Subagent-driven execution with sonnet for implementer + reviewer subagents, per `workflow_subagent_driven` + `workflow_model_selection` memory entries. 5 tasks total; M5a.4 is verification-only (no commit) and M5a.5 is deploy + handoff.
