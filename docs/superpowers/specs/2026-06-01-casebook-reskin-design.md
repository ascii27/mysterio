# Casebook Reskin — Design Spec

_Date: 2026-06-01 · Status: approved for planning_

## Context

A design handoff bundle ("Mysterio: The Maple Hollow Casebook", from Claude Design)
mocked up a warm **detective casebook** look plus several new product features. The
mock is a non-wired prototype (`mysterio-prototype/index.html`, React-via-Babel, all
data hardcoded, generation/portraits/audio simulated).

The real app (`apps/web`) is a backend-wired React + Vite app on the older
spooky-dark theme. The prototype's full feature set was decomposed into **four specs**,
each its own design → plan → build cycle:

1. **Casebook reskin** ← _this spec_ (frontend only)
2. Character creation + age (DB + generation)
3. Reputation, ranks & trophies (DB)
4. Grown-ups Settings panel (settingsStore + generation wiring)

This spec covers **only the visual reskin** of the existing, already-wired screens.
It is the foundation: it establishes the design tokens, fonts, and casebook
primitives (Folder, Stamp, SceneFrame, etc.) that specs 2–4 reuse.

## Goals

- Flip the whole app from spooky-dark to a warm **manila/ink detective casebook**:
  aged paper, slab-serif headings, typewriter labels, handwriting in notes,
  evidence-photo framing, rubber stamps, manila folder motifs.
- Do it without changing routes, data flow, API calls, or behavior — **visual only**.
- Keep the existing inline-`style={{}}` + CSS-variable convention. No CSS-module or
  class-system rewrite.

## Non-Goals (explicitly deferred to later specs)

- No new screens (world / Town / Who's Who / Trophy Room / character-creation).
- No DB, API, or generation-pipeline changes.
- No folder-grouped HQ "desk" layout (belongs with the reputation/world work).
- No real cover/portrait **image pipeline** (SceneArt provides storybook stand-ins).
- No Settings gate or expanded admin panel (Spec 4). `SettingsScreen` is only
  recolored; its two existing toggles stay as-is.
- No update to the stale "pre-implementation" claim in `CLAUDE.md`.

## Existing-code facts this design relies on

- All screens style via inline `style={{}}` reading CSS variables from
  `apps/web/src/styles/tokens.css`. No CSS modules; no global CSS beyond tokens.
- Token usage counts (informs blast radius of a value remap): `--text-dim` ×31,
  `--text` ×17, `--surface` ×17, `--radius` ×17, `--accent` ×16, `--bad` ×11,
  `--surface-2` ×6, `--pad-lg` ×5, `--bg` ×4, `--accent-2` ×2, `--good` ×1.
- Hardcoded hex (not via tokens) lives in 7 files and must be hand-updated:
  `components/Button.tsx`, `screens/MainScreen/CategoryGrid.tsx`,
  `screens/SolutionScreen/GuessForm.tsx`, `screens/SolutionScreen/CharacterPicker.tsx`,
  `screens/PlaybackScreen/ClueTracker/ClueEditor.tsx`,
  `screens/PlaybackScreen/ClueTracker/ClueCategoryTabs.tsx`,
  `screens/PlaybackScreen/AnnotatedNarrative/AnnotatedNarrative.tsx`.
- Fonts are system-only today (`ui-rounded`). `index.html` sets
  `<meta theme-color="#1a1530">`.
- Prototype source to port from (read-only reference, extracted bundle):
  `ui.jsx` (primitives), the five `screens-*.jsx`, `data.js`. The prototype's
  `app.jsx`/`tweaks-panel.jsx` are design-tool infra — **not** ported.

## Design

### 1. Design tokens & fonts

**`apps/web/src/styles/tokens.css`** — remap the existing variable *values* (names
unchanged so the ~100 existing `var(--…)` references recolor for free):

| Variable | New value | Meaning |
|---|---|---|
| `--bg` | `#e6d7b2` | app base paper |
| `--surface` | `#fbf5e5` | index-card paper |
| `--surface-2` | `#efe2c2` | manila / inputs |
| `--text` | `#2c2318` | dark ink |
| `--text-dim` | `#7c6a4e` | faded ink |
| `--accent` | `#c0892b` | brass (primary accent) |
| `--accent-2` | `#b2392f` | case-red (secondary / stamps) |
| `--good` | `#3f8a5c` | solved green |
| `--bad` | `#b2392f` | error / wrong |

**Add** new tokens: `--ink #2c2318`, `--ink-dim #7c6a4e`, `--line rgba(74,52,24,0.22)`,
`--cream #fbf4e3`, `--cream-2 #efe1c1`, `--cream-ink #2c2318`,
`--cream-ink-dim #8a7757`, `--cream-line #dcc89e`, `--gold #b58324`, `--teal #2f7d6b`,
`--radius-lg 14px`, and fonts: `--display`/`--body` = `"Zilla Slab", Georgia, serif`,
`--mono` = `"Courier Prime", ui-monospace, monospace`, `--hand` = `"Patrick Hand", cursive`.

Set `body { font-family: var(--body); }` and add a faint aged-paper texture background
(layered `radial-gradient` + `repeating-linear-gradient`, ported from the prototype's
`#app` rule). Add `h1,h2,h3 { font-family: var(--display); }`. Add the casebook helper
classes (`.stamp`, `.tape`, `.ruled`) and `@keyframes` (`pop`, `fadeUp`, `stampin`,
`floaty`) from the prototype's `<style>` block.

**Font self-hosting:** add `@fontsource/zilla-slab`, `@fontsource/courier-prime`,
`@fontsource/patrick-hand` to `apps/web` deps and import the needed weights once in
`main.tsx` (no third-party CDN request — COPPA-cleaner and works offline). Weights:
Zilla Slab 400/600/700, Courier Prime 400/700, Patrick Hand 400.

**`apps/web/index.html`** — change `<meta theme-color>` to `#e6d7b2`.

### 2. Shared casebook primitives

New directory `apps/web/src/components/casebook/`, each component one focused file,
ported from the prototype's `ui.jsx` and typed in TSX:

- **`Stamp`** — rubber-stamp text (rose border, mono, rotated). Props: `children`,
  `style?`.
- **`Tape`** — decorative tape strip (absolute-positioned). Props: `style?`.
- **`Folder`** — manila folder with colored tab + body + optional corner stamp.
  Props: `tab`, `tone?` (`manila`/`red`/`green`/`amber`), `stamp?`, `onClick?`,
  `children`, `style?`.
- **`SceneArt`** — procedural storybook-scene SVG (the `SCENE` palette map +
  `SceneShapes`). Renders a tinted scene for a given `scene` key; optional `prompt`
  caption (`✦ AI`), `kicker`, `height`, `radius`, `tape`. This is what gives cases &
  category tiles casebook **covers** without a real image pipeline.
- **`SceneFrame`** — evidence-photo frame wrapper (cream border + tape + shadow) that
  wraps either a real `<img>` or a `SceneArt`/children. Used for mystery covers.
- **`Chip`** — typewriter filing-tag. Props: `tone?`
  (`ink`/`amber`/`rose`/`teal`/`good`/`cream`), `children`, `style?`.
- **`Kicker`** — mono uppercase section label. Props: `children`, `style?`.

Index re-export from `components/casebook/index.ts`.

**`apps/web/src/components/Button.tsx`** — keep the current API
(`variant`, `size`, `...rest`); restyle variants to casebook:
`primary` = brass with hard 5px drop-shadow + brass-dark edge; add `rose`
(case-red) and `cream`; `secondary` → cream; `ghost` stays. Pill radius (`999`),
`--display` font.

### 3. Per-screen restyle (no structural/route changes)

Each existing screen keeps its logic; only `style` objects / wrappers change to the
casebook idiom listed:

- **`PlayerPicker`** — "Who's on the case today?" heading; players as paper index-card
  rows; brass titling.
- **`MainScreen`** — brass-edged "file header" welcome card; `CategoryGrid` tiles as
  SceneArt evidence cards; `DifficultyPicker` as filing tags; "Start Mystery" → brass
  CTA; `Recent` rows with status stamps. (No folder-desk; that's a later spec.)
- **`CategoryGrid`** — SceneArt-tinted tiles with selected = brass border + lift.
- **`DifficultyPicker`** — rose filing-tag selection; remove dark hex.
- **`RecentList`** — paper rows + `CaseStatus`-style chips.
- **`PlaybackScreen` + `BriefingCard`** — `SceneFrame` cover; restyled narrator/audio
  bar; ruled-paper narrative body; typed clue tags.
- **`AnnotatedNarrative`** — recolor pill highlights to casebook (clue = brass,
  person = ink/teal); preserve the existing left-align of highlighted clues.
- **`ClueTracker` / `ClueEditor` / `ClueCategoryTabs`** — ruled notebook surface +
  `--hand` font for kid input; tab restyle to filing tabs; remove dark hex.
- **`SolutionScreen` / `GuessForm` / `CharacterPicker`** — "Crack the case" header;
  suspects as ID-photo cards (brass ring when active); how/why on paper; rose submit.
- **`RevealPanel`** — cream casefile sheet; "CASE CLOSED" stamp (`stampin` keyframe);
  🔑 clue-recap list.
- **`SettingsScreen`** — casebook section/row styling; content unchanged (Spec 4 owns
  the expansion).
- **`LoadingMystery` / `FailedMystery` / `DebugPanel` / `ClueSummary` /
  `HintControls`** — paper / stamp / dashed-red-debug treatments.

### 4. Verification

- `pnpm typecheck` and `pnpm lint` clean.
- Manual iPad-viewport visual pass of every screen above (light theme renders, no
  leftover dark `#1a1530`/purple surfaces, fonts load, contrast is legible).
- Optional Playwright smoke to click through PlayerPicker → MainScreen →
  Playback → Solution → Reveal.
- No new unit tests — change is purely visual.

## Risks / Notes

- **Blast radius of token remap:** because variable names are unchanged, most
  recoloring is automatic; the risk is the 8 hardcoded-hex files and any element that
  assumed a *dark* background (e.g. translucent-white fills, purple gradients). The
  per-screen pass must hunt these explicitly (grep for `#1a1530`, `rgba(255,255,255`,
  purple hexes).
- **SceneArt scope:** porting the procedural SVG scenes is the largest single chunk.
  It is in scope because it delivers casebook covers without the (deferred) image
  pipeline, and specs 2–4 reuse it.
- **Contrast:** dark-theme text colors (`#f5f1ff`) flipped to ink must be checked for
  legibility on the new light surfaces, especially `--text-dim` on `--surface-2`.
