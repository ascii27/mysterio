# Casebook Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the existing backend-wired `apps/web` React app from the spooky-dark theme into a warm manila/ink **detective casebook** look — visual only, no route/data/behavior changes.

**Architecture:** Remap the existing CSS-variable *values* in `tokens.css` (names unchanged, so the ~100 existing `var(--…)` references recolor for free), self-host three fonts, add a small set of reusable casebook primitives under `components/casebook/`, then restyle each screen's inline `style={{}}` objects to casebook idioms. `SceneArt`/`SceneFrame` are built here as the placeholder + fallback layer the companion image-generation spec fills.

**Tech Stack:** React 18 + TypeScript + Vite, inline `style={{}}` + CSS variables (no CSS modules), `@fontsource` self-hosted fonts. Spec: `docs/superpowers/specs/2026-06-01-casebook-reskin-design.md`.

**Testing note (read first):** This is a purely visual change. The web package has **no lint and no unit-test runner** (`pnpm --filter @mysterio/web lint`/`test` are no-ops). The automated gate for every task is therefore **`pnpm --filter @mysterio/web typecheck`** (must pass with no errors), and a final task runs `vite build` + a manual iPad-viewport visual pass. Do **not** invent unit tests for style objects.

**Conventions for every task:** exact file paths below; after editing, run the typecheck command shown and confirm PASS before committing; one commit per task with the message given.

---

## Phase A — Foundation (tokens, fonts)

### Task 1: Remap design tokens + paper texture + casebook keyframes

**Files:**
- Modify: `apps/web/src/styles/tokens.css` (full replacement)
- Modify: `apps/web/index.html:7` (`<meta theme-color>`)

- [ ] **Step 1: Replace `apps/web/src/styles/tokens.css` with the casebook tokens**

```css
:root {
  /* Detective casebook: warm manila paper + ink, brass & case-red accents.
     Existing variable NAMES are kept so screens recolor in place; values now
     describe PAPER surfaces (light) with dark ink text. */
  --bg: #e6d7b2;          /* app base paper */
  --surface: #fbf5e5;     /* index-card paper */
  --surface-2: #efe2c2;   /* manila / inputs */
  --text: #2c2318;        /* dark ink */
  --text-dim: #7c6a4e;    /* faded ink */
  --accent: #c0892b;      /* brass — primary accent */
  --accent-2: #b2392f;    /* case red — secondary / stamps */
  --good: #3f8a5c;        /* solved green */
  --bad: #b2392f;         /* error / wrong */

  /* added casebook tokens */
  --ink: #2c2318;
  --ink-dim: #7c6a4e;
  --line: rgba(74, 52, 24, 0.22);
  --cream: #fbf4e3;       /* casefile sheet */
  --cream-2: #efe1c1;
  --cream-ink: #2c2318;
  --cream-ink-dim: #8a7757;
  --cream-line: #dcc89e;
  --gold: #b58324;        /* rank & trophy gold */
  --teal: #2f7d6b;

  --radius: 14px;
  --radius-lg: 14px;
  --pad: 16px;
  --pad-lg: 24px;

  --display: "Zilla Slab", Georgia, serif;
  --body: "Zilla Slab", Georgia, serif;
  --mono: "Courier Prime", ui-monospace, Menlo, monospace;
  --hand: "Patrick Hand", "Comic Sans MS", cursive;

  font-family: var(--body);
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body, #root { margin: 0; min-height: 100%; color: var(--text); }
body {
  font-family: var(--body);
  /* aged-paper texture: faint fibres + warm wash */
  background:
    radial-gradient(60% 50% at 18% 8%, rgba(255, 250, 235, 0.6), transparent 60%),
    radial-gradient(70% 60% at 92% 96%, rgba(150, 118, 66, 0.16), transparent 60%),
    repeating-linear-gradient(96deg, rgba(120, 92, 46, 0.035) 0 2px, transparent 2px 5px),
    linear-gradient(160deg, #ece0c1, #e3d3ac);
  background-attachment: fixed;
}
h1, h2, h3 { font-family: var(--display); line-height: 1.1; }
button { font-family: inherit; cursor: pointer; border: none; }
input, textarea { font-family: inherit; }

/* casebook flourishes */
.stamp {
  font-family: var(--mono); font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--accent-2); border: 2.5px solid var(--accent-2);
  border-radius: 5px; padding: 5px 10px; opacity: 0.85; white-space: nowrap;
}
.ruled { background-image: repeating-linear-gradient(0deg, transparent 0 27px, rgba(120,92,46,0.15) 27px 28px); }

@keyframes pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes stampin { 0% { transform: scale(2.4) rotate(-8deg); opacity: 0; } 55% { opacity: 1; } 70% { transform: scale(0.92) rotate(-8deg); } 100% { transform: scale(1) rotate(-8deg); opacity: 0.85; } }
```

- [ ] **Step 2: Update the theme-color meta in `apps/web/index.html`**

Replace the line `<meta name="theme-color" content="#1a1530" />` with:

```html
    <meta name="theme-color" content="#e6d7b2" />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS (CSS changes don't affect types; this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/tokens.css apps/web/index.html
git commit -m "M-reskin: casebook design tokens, paper texture, keyframes"
```

### Task 2: Self-host fonts and import them

**Files:**
- Modify: `apps/web/package.json` (add three deps)
- Modify: `apps/web/src/main.tsx:6` (font imports)

- [ ] **Step 1: Add the font packages**

Run:
```bash
pnpm --filter @mysterio/web add @fontsource/zilla-slab @fontsource/courier-prime @fontsource/patrick-hand
```
Expected: the three packages appear in `apps/web/package.json` dependencies and install succeeds.

- [ ] **Step 2: Import the needed weights in `apps/web/src/main.tsx`**

Immediately after the existing line `import "./styles/tokens.css";`, add:

```ts
import "@fontsource/zilla-slab/400.css";
import "@fontsource/zilla-slab/600.css";
import "@fontsource/zilla-slab/700.css";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "@fontsource/patrick-hand/400.css";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/src/main.tsx pnpm-lock.yaml
git commit -m "M-reskin: self-host Zilla Slab + Courier Prime + Patrick Hand"
```
(Commands run from the repo root, where `pnpm-lock.yaml` lives. If `pnpm` updated a
differently-located lockfile, `git add` that path instead so the commit includes it.)

---

## Phase B — Casebook primitives (`apps/web/src/components/casebook/`)

> All primitives are presentational, typed TSX, ported from the prototype's `ui.jsx`.
> Create the directory with the first task.

### Task 3: Stamp, Tape, Chip, Kicker

**Files:**
- Create: `apps/web/src/components/casebook/Stamp.tsx`
- Create: `apps/web/src/components/casebook/Tape.tsx`
- Create: `apps/web/src/components/casebook/Chip.tsx`
- Create: `apps/web/src/components/casebook/Kicker.tsx`

- [ ] **Step 1: Create `Stamp.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";

export function Stamp({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="stamp" style={{ fontSize: 11, display: "inline-block", ...style }}>{children}</span>;
}
```

- [ ] **Step 2: Create `Tape.tsx`**

```tsx
import type { CSSProperties } from "react";

export function Tape({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute", height: 22, width: 80,
        background: "rgba(208,184,132,0.62)",
        borderLeft: "1px dashed rgba(120,96,50,0.4)",
        borderRight: "1px dashed rgba(120,96,50,0.4)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.12)", mixBlendMode: "multiply",
        ...style,
      }}
    />
  );
}
```

- [ ] **Step 3: Create `Chip.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";

type Tone = "ink" | "amber" | "rose" | "teal" | "good" | "cream";

const TONES: Record<Tone, CSSProperties> = {
  ink:   { background: "rgba(74,52,24,0.06)", color: "var(--ink-dim)", borderColor: "var(--line)" },
  amber: { background: "rgba(192,137,43,0.12)", color: "var(--accent)", borderColor: "rgba(192,137,43,0.5)" },
  rose:  { background: "rgba(178,57,47,0.1)", color: "var(--accent-2)", borderColor: "rgba(178,57,47,0.45)" },
  teal:  { background: "rgba(47,125,107,0.12)", color: "var(--teal)", borderColor: "rgba(47,125,107,0.45)" },
  good:  { background: "rgba(63,138,92,0.12)", color: "var(--good)", borderColor: "rgba(63,138,92,0.5)" },
  cream: { background: "var(--cream-2)", color: "var(--cream-ink-dim)", borderColor: "var(--cream-line)" },
};

export function Chip({ children, tone = "ink", style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700,
      whiteSpace: "nowrap", fontFamily: "var(--mono)", textTransform: "uppercase",
      letterSpacing: "0.05em", border: "1px solid", padding: "3px 8px", borderRadius: 4,
      ...TONES[tone], ...style,
    }}>{children}</span>
  );
}
```

- [ ] **Step 4: Create `Kicker.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";

export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "var(--ink-dim)", marginBottom: 10, ...style,
    }}>{children}</div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/casebook/
git commit -m "M-reskin: casebook primitives — Stamp, Tape, Chip, Kicker"
```

### Task 4: Folder

**Files:**
- Create: `apps/web/src/components/casebook/Folder.tsx`

- [ ] **Step 1: Create `Folder.tsx`**

```tsx
import { useState, type CSSProperties, type ReactNode } from "react";

type Tone = "manila" | "red" | "green" | "amber";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  manila: { bg: "#d9bd84", fg: "#4a3a1c" },
  red:    { bg: "#b2392f", fg: "#fff2ee" },
  green:  { bg: "#2f7d6b", fg: "#eafff8" },
  amber:  { bg: "#c0892b", fg: "#33240c" },
};

export function Folder({
  tab, tone = "manila", stamp, onClick, children, style,
}: {
  tab: ReactNode; tone?: Tone; stamp?: ReactNode; onClick?: () => void;
  children: ReactNode; style?: CSSProperties;
}) {
  const tc = TONES[tone];
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: "relative", paddingTop: 15, cursor: onClick ? "pointer" : "default",
        transition: "transform .14s", transform: h && onClick ? "translateY(-3px)" : "none", ...style,
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 14, height: 19, maxWidth: "72%", padding: "0 12px",
        display: "flex", alignItems: "center", background: tc.bg, color: tc.fg,
        borderRadius: "8px 8px 0 0", fontFamily: "var(--mono)", fontSize: 9.5, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis", boxShadow: "0 -1px 2px rgba(0,0,0,0.12)",
      }}>{tab}</div>
      <div style={{
        background: "linear-gradient(168deg,#ecd9a8,#e1c98e)", border: "1px solid #c8ab68",
        borderRadius: "0 9px 9px 9px", padding: 10, position: "relative",
        boxShadow: h && onClick ? "0 12px 22px -10px rgba(40,28,12,0.6)" : "0 3px 8px -3px rgba(40,28,12,0.45)",
      }}>
        {children}
        {stamp && (
          <div className="stamp" style={{ position: "absolute", right: 8, top: 8, fontSize: 9.5, transform: "rotate(8deg)" }}>
            {stamp}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/casebook/Folder.tsx
git commit -m "M-reskin: casebook primitive — Folder"
```

### Task 5: SceneArt (procedural storybook scenes)

**Files:**
- Create: `apps/web/src/components/casebook/SceneArt.tsx`

This is ported near-verbatim from the prototype's `ui.jsx` `SceneArt`/`SceneShapes`/`Stars`/`SCENE`. `scene` is a typed union; `SCENE_FOR_CATEGORY` maps the four real category ids to a scene.

- [ ] **Step 1: Create `SceneArt.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";

export type SceneKey =
  | "home" | "store" | "library" | "park" | "lighthouse"
  | "marina" | "woods" | "manor" | "town" | "generic";

/** Maps the live app's category ids to a storybook scene. */
export const SCENE_FOR_CATEGORY: Record<string, SceneKey> = {
  "missing-pet": "park",
  "haunted-mansion": "manor",
  "stolen-treasure": "marina",
  "locked-room": "lighthouse",
};

type Palette = { sky: [string, string]; far: string; near: string; glow: string };

const SCENE: Record<SceneKey, Palette> = {
  home:       { sky: ["#3a2c5e", "#f6a96b"], far: "#2a1f49", near: "#19112e", glow: "#ffd479" },
  store:      { sky: ["#274060", "#e98b6a"], far: "#1d2f4a", near: "#141d33", glow: "#ffd479" },
  library:    { sky: ["#4a2f57", "#e0a05a"], far: "#3a2240", near: "#241326", glow: "#ffcf6e" },
  park:       { sky: ["#5b3a6e", "#f6b06b"], far: "#3c2a5a", near: "#1f2c1c", glow: "#ffe08a" },
  lighthouse: { sky: ["#2c2f63", "#7f9bd0"], far: "#222a52", near: "#161a38", glow: "#fff0b0" },
  marina:     { sky: ["#21465c", "#7fb6c0"], far: "#173846", near: "#0f2630", glow: "#ffe08a" },
  woods:      { sky: ["#243a4a", "#5f8d72"], far: "#1d3038", near: "#13211f", glow: "#bfffd0" },
  manor:      { sky: ["#3a2658", "#8a5fb0"], far: "#2a1a44", near: "#170f2b", glow: "#ffd479" },
  town:       { sky: ["#3a2c5e", "#e9a06a"], far: "#2a1f49", near: "#191230", glow: "#ffd479" },
  generic:    { sky: ["#2c2356", "#5b8def"], far: "#241c44", near: "#160f2b", glow: "#f4a64d" },
};

function Stars({ n = 16 }: { n?: number }) {
  const dots: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const x = ((i * 53) % 380) + 12, y = ((i * 29) % 70) + 8, r = (i % 3) * 0.4 + 0.7;
    dots.push(<circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.35 + (i % 4) * 0.12} />);
  }
  return <g>{dots}</g>;
}

function SceneShapes({ scene, p }: { scene: SceneKey; p: Palette }) {
  const moon = <circle cx="318" cy="56" r="22" fill={p.glow} opacity="0.9" />;
  const lit = (x: number, y: number, w: number, h: number) =>
    <rect x={x} y={y} width={w} height={h} rx="1.5" fill={p.glow} opacity="0.92" />;
  switch (scene) {
    case "lighthouse":
      return (<g>{moon}
        <path d="M0 200 Q100 184 200 196 T400 192 V260 H0 Z" fill={p.far} />
        <polygon points="196,80 214,80 222,200 188,200" fill={p.near} />
        <rect x="192" y="74" width="26" height="14" rx="2" fill="#2a3a5e" />
        <circle cx="205" cy="80" r="9" fill={p.glow} />
        <polygon points="205,80 360,40 360,58 205,90" fill={p.glow} opacity="0.28" />
        <polygon points="205,80 60,46 60,64 205,92" fill={p.glow} opacity="0.18" />
        {lit(197, 110, 7, 9)}{lit(206, 130, 7, 9)}
        <path d="M0 210 Q200 230 400 210 V260 H0 Z" fill={p.near} /></g>);
    case "manor":
      return (<g>{moon}
        <path d="M0 196 Q200 168 400 196 V260 H0 Z" fill={p.far} />
        <rect x="118" y="120" width="164" height="86" fill={p.near} />
        <polygon points="108,120 200,78 292,120" fill={p.near} />
        <polygon points="150,98 200,74 250,98 250,120 150,120" fill={p.near} />
        {lit(140,140,18,22)}{lit(182,140,18,22)}{lit(224,140,18,22)}{lit(188,168,24,38)}
        <rect x="262" y="60" width="10" height="64" fill={p.near} /></g>);
    case "park":
      return (<g>{moon}
        <path d="M0 188 Q200 168 400 188 V260 H0 Z" fill={p.far} />
        <ellipse cx="250" cy="232" rx="150" ry="20" fill={p.glow} opacity="0.16" />
        <rect x="86" y="120" width="9" height="100" fill={p.near} />
        <path d="M90 70 Q40 96 56 150 Q90 120 90 150 Q92 116 124 150 Q140 96 90 70Z" fill={p.near} />
        <path d="M90 120 Q70 160 60 210 M90 122 Q104 162 118 206 M90 124 Q90 168 90 214" stroke={p.near} strokeWidth="3" fill="none" opacity="0.8" />
        <path d="M0 214 Q200 232 400 214 V260 H0 Z" fill={p.near} /></g>);
    case "marina":
      return (<g>{moon}
        <rect x="0" y="178" width="400" height="82" fill={p.far} opacity="0.6" />
        <g opacity="0.95">
          <polygon points="120,118 124,178 96,178" fill={p.near} /><polygon points="124,120 124,178 156,178" fill={p.near} opacity="0.85" />
          <polygon points="232,108 236,178 206,178" fill={p.near} /><polygon points="236,110 236,178 270,178" fill={p.near} opacity="0.85" />
        </g>
        <g stroke={p.glow} strokeWidth="2" opacity="0.3">
          <line x1="40" y1="206" x2="360" y2="206" /><line x1="60" y1="226" x2="340" y2="226" />
        </g>
        <rect x="0" y="178" width="400" height="82" fill={p.near} opacity="0.5" /></g>);
    case "store":
      return (<g><Stars n={10} />
        <path d="M0 196 H400 V260 H0 Z" fill={p.far} />
        <rect x="120" y="116" width="160" height="92" fill={p.near} />
        <g>{[...Array(8)].map((_, i) => <rect key={i} x={116 + i * 20} y="104" width="20" height="16" fill={i % 2 ? p.glow : "#d05b6a"} opacity="0.85" />)}</g>
        {lit(140,140,40,36)}{lit(218,140,44,36)}
        <rect x="186" y="158" width="22" height="50" fill="#2a1f49" /></g>);
    case "library":
      return (<g>
        <rect x="0" y="0" width="400" height="260" fill={p.far} opacity="0.5" />
        {[...Array(5)].map((_, i) => <rect key={i} x={40 + i * 70} y={70} width="48" height="150" fill={p.near} />)}
        {[...Array(20)].map((_, i) => <rect key={"b" + i} x={44 + (i % 5) * 70 + (i % 3) * 4} y={78 + Math.floor(i / 5) * 36} width="6" height="30" fill={[p.glow, "#d05b6a", "#5b8def", "#5fb98c"][i % 4]} opacity="0.8" />)}
        <circle cx="330" cy="96" r="16" fill={p.glow} opacity="0.5" /></g>);
    case "woods":
      return (<g><Stars n={8} />
        {[...Array(6)].map((_, i) => <polygon key={i} points={`${30 + i * 68},90 ${50 + i * 68},220 ${10 + i * 68},220`} fill={i % 2 ? p.near : p.far} />)}
        {[...Array(10)].map((_, i) => <circle key={"f" + i} cx={40 + i * 36} cy={120 + (i % 4) * 26} r="2.5" fill={p.glow} opacity="0.9" />)}
        <path d="M0 224 H400 V260 H0Z" fill={p.near} /></g>);
    case "town":
      return (<g>{moon}
        <path d="M0 196 H400 V260 H0Z" fill={p.far} />
        {[...Array(5)].map((_, i) => <rect key={i} x={30 + i * 74} y={130 + (i % 2) * 16} width="58" height="90" fill={p.near} />)}
        <rect x="180" y="92" width="40" height="128" fill={p.near} /><polygon points="176,92 200,66 224,92" fill={p.near} />
        <circle cx="200" cy="116" r="11" fill={p.glow} />
        {[...Array(6)].map((_, i) => <rect key={"w" + i} x={40 + i * 74} y={150} width="14" height="18" fill={p.glow} opacity="0.85" />)}</g>);
    case "home":
    case "generic":
    default:
      return (<g>{moon}
        <path d="M0 192 Q200 174 400 192 V260 H0Z" fill={p.far} />
        <rect x="172" y="92" width="14" height="120" fill={p.near} />
        <path d="M120 150 Q120 116 176 116 Q236 112 240 150 Q244 188 180 186 Q120 188 120 150Z" fill={p.near} />
        <rect x="150" y="130" width="78" height="46" rx="4" fill="#2a1f49" />
        <polygon points="146,130 189,108 232,130" fill={p.near} />
        {lit(162,140,18,16)}{lit(196,140,18,16)}
        <path d="M0 216 Q200 232 400 216 V260 H0Z" fill={p.near} /></g>);
  }
}

export function SceneArt({
  scene = "generic", prompt, height = 200, radius = "var(--radius-lg)", kicker, style,
}: {
  scene?: SceneKey; prompt?: string; height?: number | string;
  radius?: number | string; kicker?: string; style?: CSSProperties;
}) {
  const p = SCENE[scene] ?? SCENE.generic;
  const framed = radius !== 0 && radius !== "0";
  const showStars = ["lighthouse", "manor", "park", "marina", "town", "home"].includes(scene);
  return (
    <div style={{ position: "relative", width: "100%", ...style }}>
      <div style={{
        position: "relative", width: "100%", height, borderRadius: radius, overflow: "hidden",
        border: framed ? "4px solid #fbf4e3" : "none",
        boxShadow: framed
          ? "0 3px 10px -2px rgba(40,28,12,0.45), inset 0 0 0 1px rgba(0,0,0,0.2)"
          : "inset 0 0 0 1px rgba(0,0,0,0.18)",
      }}>
        <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <linearGradient id={"sky-" + scene} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={p.sky[0]} /><stop offset="1" stopColor={p.sky[1]} />
            </linearGradient>
            <radialGradient id={"vig-" + scene} cx="0.5" cy="0.42" r="0.75">
              <stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.45" />
            </radialGradient>
          </defs>
          <rect width="400" height="260" fill={`url(#sky-${scene})`} />
          {showStars && <Stars n={14} />}
          <SceneShapes scene={scene} p={p} />
          <rect width="400" height="260" fill={`url(#vig-${scene})`} />
        </svg>
        {kicker && (
          <div style={{
            position: "absolute", top: 10, left: 10, fontFamily: "var(--mono)", fontWeight: 700,
            fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2c2318",
            background: "rgba(251,244,227,0.9)", padding: "3px 7px", borderRadius: 3,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}>{kicker}</div>
        )}
        {prompt && (
          <div title="This image is generated by AI for each case" style={{
            position: "absolute", bottom: 7, left: 9, right: 9, display: "flex", alignItems: "center",
            gap: 6, fontFamily: "var(--mono)", fontSize: 9.5, color: "rgba(255,255,255,0.78)",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          }}>
            <span style={{ color: "#ffd479" }}>✦ AI</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prompt}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/casebook/SceneArt.tsx
git commit -m "M-reskin: casebook primitive — SceneArt procedural scenes"
```

### Task 6: SceneFrame (evidence-photo frame; real cover OR SceneArt fallback)

**Files:**
- Create: `apps/web/src/components/casebook/SceneFrame.tsx`

This is the seam the image-generation spec fills: pass `imageUrl` to show a real cover, else it renders a `SceneArt` for `scene`. Tape strip + `✦ AI` caption framing.

- [ ] **Step 1: Create `SceneFrame.tsx`**

```tsx
import type { CSSProperties } from "react";
import { SceneArt, type SceneKey } from "./SceneArt.js";
import { Tape } from "./Tape.js";

export function SceneFrame({
  imageUrl, scene = "generic", height = 200, kicker, prompt, tape = true, style,
}: {
  imageUrl?: string | null; scene?: SceneKey; height?: number;
  kicker?: string; prompt?: string; tape?: boolean; style?: CSSProperties;
}) {
  if (!imageUrl) {
    // Fallback: procedural storybook scene (already self-frames).
    return (
      <div style={{ position: "relative", width: "100%", ...style }}>
        {tape && <Tape style={{ top: -8, left: "50%", transform: "translateX(-50%) rotate(-2.5deg)", zIndex: 1 }} />}
        <SceneArt scene={scene} height={height} kicker={kicker} prompt={prompt} />
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: "100%", ...style }}>
      {tape && <Tape style={{ top: -8, left: "50%", transform: "translateX(-50%) rotate(-2.5deg)", zIndex: 1 }} />}
      <div style={{
        position: "relative", width: "100%", height, borderRadius: "var(--radius-lg)", overflow: "hidden",
        border: "4px solid #fbf4e3",
        boxShadow: "0 3px 10px -2px rgba(40,28,12,0.45), inset 0 0 0 1px rgba(0,0,0,0.2)",
      }}>
        <img src={imageUrl} alt={kicker ?? "Case cover"} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
        {kicker && (
          <div style={{
            position: "absolute", top: 10, left: 10, fontFamily: "var(--mono)", fontWeight: 700,
            fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2c2318",
            background: "rgba(251,244,227,0.9)", padding: "3px 7px", borderRadius: 3,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}>{kicker}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/casebook/SceneFrame.tsx
git commit -m "M-reskin: casebook primitive — SceneFrame (cover img + SceneArt fallback)"
```

### Task 7: Barrel export

**Files:**
- Create: `apps/web/src/components/casebook/index.ts`

- [ ] **Step 1: Create `index.ts`**

```ts
export { Stamp } from "./Stamp.js";
export { Tape } from "./Tape.js";
export { Chip } from "./Chip.js";
export { Kicker } from "./Kicker.js";
export { Folder } from "./Folder.js";
export { SceneArt, SCENE_FOR_CATEGORY, type SceneKey } from "./SceneArt.js";
export { SceneFrame } from "./SceneFrame.js";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/casebook/index.ts
git commit -m "M-reskin: casebook barrel export"
```

### Task 8: Button casebook variants

**Files:**
- Modify: `apps/web/src/components/Button.tsx` (full replacement)

Keeps the existing API (`variant`, `size`, `...rest`) — callers pass `variant="primary" | "secondary" | "ghost"` today; add `"rose"` and `"cream"`. Brass primary with a hard drop-shadow + press feedback.

- [ ] **Step 1: Replace `Button.tsx`**

```tsx
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "rose" | "cream";
  size?: "md" | "lg";
  children: ReactNode;
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, CSSProperties> = {
  primary:   { background: "var(--accent)", color: "#33240c", boxShadow: "0 5px 0 -1px #8c5f1d, 0 9px 16px -8px rgba(140,95,29,0.7)" },
  rose:      { background: "var(--accent-2)", color: "#fff5f0", boxShadow: "0 5px 0 -1px #7e2b22, 0 9px 16px -8px rgba(126,43,34,0.6)" },
  cream:     { background: "var(--cream)", color: "var(--cream-ink)", boxShadow: "0 5px 0 -1px #cdbb97, inset 0 0 0 1px var(--cream-line)" },
  secondary: { background: "var(--surface)", color: "var(--text)", boxShadow: "inset 0 0 0 1.5px var(--line)" },
  ghost:     { background: "transparent", color: "var(--text-dim)" },
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, CSSProperties> = {
  md: { padding: "11px 20px", fontSize: 16 },
  lg: { padding: "15px 26px", fontSize: 19 },
};

export function Button({ variant = "primary", size = "md", style, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      style={{
        fontFamily: "var(--display)", fontWeight: 700, borderRadius: 999,
        transition: "transform .12s, filter .12s", opacity: rest.disabled ? 0.45 : 1,
        ...variantStyles[variant], ...sizeStyles[size], ...style,
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(2px)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ""; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS (existing callers only use primary/secondary/ghost, which still exist).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/Button.tsx
git commit -m "M-reskin: Button casebook variants (brass/rose/cream)"
```

---

## Phase C — Screen restyles

> Each task replaces the named file's presentation only. Behavior, props, hooks,
> queries, and routes are unchanged. After each, run
> `pnpm --filter @mysterio/web typecheck` (Expected: PASS) then commit with the
> message shown. Watch for leftover dark values: grep each file you touch for
> `#1a1530`, `#f5c84c`, `rgba(255,255,255`, and any purple hex — none should remain.

### Task 9: PlayerPicker

**Files:**
- Modify: `apps/web/src/screens/PlayerPicker.tsx` (full replacement of the returned JSX)

- [ ] **Step 1: Replace the component body**

```tsx
import { useQuery } from "@tanstack/react-query";
import { listPlayers } from "../api/players.js";
import { usePlayerStore } from "../state/playerStore.js";
import { Kicker } from "../components/casebook/index.js";

export function PlayerPicker() {
  const setActivePlayer = usePlayerStore((s) => s.setActivePlayer);
  const { data, isLoading, isError } = useQuery({ queryKey: ["players"], queryFn: listPlayers });

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (isError || !data) return <div style={{ padding: 24, color: "var(--bad)" }}>Couldn't load players.</div>;

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>
        <div style={{ fontSize: 50, animation: "floaty 4s ease-in-out infinite" }}>🔎</div>
        <h1 style={{ fontSize: 48, margin: "4px 0 2px" }}>Mysterio</h1>
        <div style={{ color: "var(--accent)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, letterSpacing: "0.12em" }}>
          THE CASEBOOK
        </div>
        <p style={{ color: "var(--text-dim)", margin: "10px 0 24px" }}>Who's on the case today?</p>
        <Kicker style={{ textAlign: "left" }}>Detectives</Kicker>
        <div style={{ display: "grid", gap: 14 }}>
          {data.players.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePlayer(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                background: "var(--surface)", border: "1px solid var(--line)",
                borderRadius: "var(--radius)", padding: 16, cursor: "pointer",
                boxShadow: "0 2px 0 rgba(0,0,0,0.2)",
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 10, flex: "0 0 auto", display: "grid", placeItems: "center",
                background: "radial-gradient(120% 120% at 30% 25%, var(--accent), #7a3b1a)",
                color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: 22,
                border: "3px solid #fbf4e3",
              }}>{(p.name[0] ?? "?").toUpperCase()}</div>
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22 }}>{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlayerPicker.tsx && git commit -m "M-reskin: PlayerPicker casebook style"
```

### Task 10: MainScreen

**Files:**
- Modify: `apps/web/src/screens/MainScreen/MainScreen.tsx` (replace the returned JSX; keep all hooks/logic above `return` exactly as-is)

- [ ] **Step 1: Replace the `return (...)` block** (everything from `return (` to the closing `);`) with:

```tsx
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>Mysterio</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={clearPlayer}
            style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", borderRadius: 8, padding: "8px 12px", color: "var(--text-dim)", fontSize: 13, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}
          >
            {player?.name ?? "?"} · Switch
          </button>
          <Link to="/settings" aria-label="Settings" title="Grown-up settings" style={{ width: 38, height: 38, borderRadius: 8, background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--line)", display: "grid", placeItems: "center", textDecoration: "none", fontSize: 18 }}>
            🔧
          </Link>
        </div>
      </header>

      <div
        style={{
          background: "linear-gradient(135deg, #f3ead0, #e7d6ac)",
          padding: 18,
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--line)",
          boxShadow: "0 2px 8px -3px rgba(40,28,12,0.3), inset 4px 0 0 var(--accent)",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--display)", fontWeight: 700 }}>
          Welcome back
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, fontFamily: "var(--display)" }}>
          Detective {player?.name ?? ""} 🕵️
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <Kicker>Pick a kind of mystery</Kicker>
        <CategoryGrid selected={category} onSelect={setCategory} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <Kicker>How tricky?</Kicker>
        <DifficultyPicker selected={difficulty} onSelect={setDifficulty} />
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>
          {difficultyConfig(difficulty).essentialClues} essential clues · target ~{difficultyConfig(difficulty).targetWords} words
        </p>
      </section>

      <Button
        size="lg"
        disabled={!category || generate.isPending}
        onClick={() => generate.mutate()}
        style={{ width: "100%" }}
      >
        {generate.isPending ? "Crafting…" : "🔍 Start the Case"}
      </Button>

      <section style={{ marginTop: 32 }}>
        <Kicker>Recent case files</Kicker>
        <RecentList playerId={playerId} />
      </section>
    </div>
  );
```

- [ ] **Step 2: Add the `Kicker` import** at the top of the file, after the `RecentList` import:

```tsx
import { Kicker } from "../../components/casebook/index.js";
```

- [ ] **Step 3: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/MainScreen/MainScreen.tsx && git commit -m "M-reskin: MainScreen casebook style"
```

### Task 11: CategoryGrid (SceneArt evidence tiles)

**Files:**
- Modify: `apps/web/src/screens/MainScreen/CategoryGrid.tsx` (full replacement)

- [ ] **Step 1: Replace the file**

```tsx
import { CATEGORIES, type CategoryId } from "@mysterio/shared";
import { SceneArt, SCENE_FOR_CATEGORY } from "../../components/casebook/index.js";

const ICONS: Record<CategoryId, string> = {
  "missing-pet": "🐾",
  "haunted-mansion": "👻",
  "stolen-treasure": "💎",
  "locked-room": "🔒",
};

export function CategoryGrid({
  selected,
  onSelect,
}: {
  selected: CategoryId | null;
  onSelect: (id: CategoryId) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {CATEGORIES.map((c) => {
        const active = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              textAlign: "left", padding: 0, overflow: "hidden", cursor: "pointer",
              background: "var(--surface)", borderRadius: "var(--radius)",
              border: active ? "2px solid var(--accent)" : "2px solid transparent",
              transform: active ? "translateY(-2px)" : "none", transition: "transform .12s",
              boxShadow: active ? "0 12px 24px -12px rgba(192,137,43,0.6)" : "0 2px 0 rgba(0,0,0,0.2)",
            }}
          >
            <SceneArt scene={SCENE_FOR_CATEGORY[c.id] ?? "generic"} height={84} radius={0} />
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "var(--display)" }}>{ICONS[c.id]} {c.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.35 }}>{c.blurb}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/MainScreen/CategoryGrid.tsx && git commit -m "M-reskin: CategoryGrid SceneArt tiles"
```

### Task 12: DifficultyPicker (rose filing tags)

**Files:**
- Modify: `apps/web/src/screens/MainScreen/DifficultyPicker.tsx` (replace the `<button>` style only)

- [ ] **Step 1: Replace the `style={{ ... }}` object on the button** with:

```tsx
            style={{
              background: active ? "var(--accent-2)" : "var(--surface)",
              color: active ? "#fff5f0" : "var(--text)",
              border: active ? "2px solid var(--accent-2)" : "2px solid var(--line)",
              borderRadius: "var(--radius)",
              padding: "14px 8px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 17,
              fontFamily: "var(--display)",
            }}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/MainScreen/DifficultyPicker.tsx && git commit -m "M-reskin: DifficultyPicker filing tags"
```

### Task 13: RecentList (paper rows + status chips)

**Files:**
- Modify: `apps/web/src/screens/MainScreen/RecentList.tsx` (full replacement)

- [ ] **Step 1: Replace the file**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listMysteries } from "../../api/mysteries.js";
import { Chip } from "../../components/casebook/index.js";

export function RecentList({ playerId }: { playerId: string }) {
  const { data } = useQuery({
    queryKey: ["mysteries", playerId],
    queryFn: () => listMysteries(playerId, 10),
  });
  if (!data || data.mysteries.length === 0) {
    return <p style={{ color: "var(--text-dim)", fontSize: 14 }}>No case files yet — start one above.</p>;
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {data.mysteries.map((m) => {
        const chip = m.solved
          ? <Chip tone="good">✓ Solved</Chip>
          : m.status === "failed"
          ? <Chip tone="rose">✗ Failed</Chip>
          : m.status === "ready"
          ? <Chip tone="amber">Unsolved</Chip>
          : <Chip tone="teal">In progress</Chip>;
        return (
          <li key={m.id}>
            <Link
              to={`/mysteries/${m.id}`}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                background: "var(--surface)", border: "1px solid var(--line)", padding: 12,
                borderRadius: "var(--radius)", color: "var(--text)", textDecoration: "none",
                boxShadow: "0 2px 0 rgba(0,0,0,0.15)",
              }}
            >
              <span style={{ fontFamily: "var(--display)", fontWeight: 700 }}>{m.title ?? "Untitled"}</span>
              {chip}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/MainScreen/RecentList.tsx && git commit -m "M-reskin: RecentList paper rows + status chips"
```

### Task 14: PlaybackScreen + AudioSection

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx`

The cover seam lives here: render a `SceneFrame` above the title using the case's category scene (real `cover_image_url` is wired by the image-generation spec — here it passes `undefined`, so the SceneArt fallback shows).

- [ ] **Step 1: Add imports** after the existing `LoadingMystery` import:

```tsx
import { Kicker, SceneFrame, SCENE_FOR_CATEGORY } from "../../components/casebook/index.js";
```

- [ ] **Step 2: Replace the main `return (...)` block** (the one starting `return (` after `const annotations = ...`) with:

```tsx
  return (
    <>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--pad-lg)", paddingBottom: 80 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Back</Link>
          <Link to={`/mysteries/${mysteryId}/solve`}><Button>I think I know!</Button></Link>
        </header>
        <SceneFrame
          imageUrl={undefined}
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
```

> Note: if `data.category` is not on the `MysteryDetail` type, use the value already
> available on `data` for the category id; the field exists in the DTO (the BriefingCard
> reads `mystery.category`). The `Kicker` import is included for consistency with other
> screens even if unused here — remove it if `typecheck`/build flags an unused import.

- [ ] **Step 3: Restyle `AudioSection`** — replace its `return` blocks' inline styles so the fallback button uses `variant="cream"`:

In `AudioSection`, change `<Button variant="secondary" ...>` to `<Button variant="cream" ...>` and keep the rest.

- [ ] **Step 4: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/PlaybackScreen.tsx && git commit -m "M-reskin: PlaybackScreen cover (SceneFrame) + casebook header"
```
> If `Kicker` is unused and the build errors on it, drop it from the import in Step 1 before committing.

### Task 15: BriefingCard

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx`

- [ ] **Step 1: Add import** after the `Button` import:

```tsx
import { SceneFrame, SCENE_FOR_CATEGORY } from "../../../components/casebook/index.js";
```

- [ ] **Step 2: Replace the outer card** — change the wrapper `<div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, border: "2px solid var(--accent)", textAlign: "center" }}>` and the leading emoji block. Replace from that opening div through the `Today's case` block with:

```tsx
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-lg)",
          padding: 20,
          border: "1px solid var(--line)",
          boxShadow: "0 2px 0 rgba(0,0,0,0.2)",
          textAlign: "center",
        }}
      >
        <SceneFrame
          imageUrl={undefined}
          scene={SCENE_FOR_CATEGORY[mystery.category] ?? "generic"}
          height={150}
          kicker="Today's Case"
          style={{ marginBottom: 14 }}
        />
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, fontFamily: "var(--display)" }}>
          {mystery.title ?? "Untitled Mystery"}
        </div>
```

(Delete the old `<div style={{ fontSize: 48 }}>{icon}</div>` and the `Today's case` uppercase label — the `kicker` on `SceneFrame` replaces them. `icon` becomes unused; remove the `const icon = ...` line and the `CATEGORY_EMOJI` map if the build flags them as unused.)

- [ ] **Step 3: Restyle `CastRow`** — in `CastRow`, change `background: "var(--bg)"` to `background: "var(--surface-2)"` and `borderRadius: 6` to `borderRadius: 8`.

- [ ] **Step 4: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/BriefingCard/BriefingCard.tsx && git commit -m "M-reskin: BriefingCard cover + casebook surface"
```

### Task 16: AnnotatedNarrative (recolor pills, ruled body)

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/AnnotatedNarrative/AnnotatedNarrative.tsx`

- [ ] **Step 1: Replace the four color constants** at the top:

```tsx
const PERSON_COLOR = "var(--teal)";
const PERSON_BG = "rgba(47,125,107,0.16)";

const CLUE_COLOR = "var(--accent)";
const CLUE_BG = "rgba(192,137,43,0.18)";
```

- [ ] **Step 2: Restyle the narrative container** — replace the wrapper `<div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 16 }}>` with:

```tsx
    <div style={{
      background: "var(--surface)", border: "1px solid var(--line)", padding: "16px 18px",
      borderRadius: "var(--radius)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 16.5,
      color: "var(--ink)", boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
    }}>
```

(Keep the existing `textAlign: "left"` comment + property on the highlight button — do not remove it.)

- [ ] **Step 3: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/AnnotatedNarrative/AnnotatedNarrative.tsx && git commit -m "M-reskin: AnnotatedNarrative casebook pills + paper body"
```

### Task 17: ClueTracker (notebook surface, filing-tab open button)

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueTracker.tsx`

- [ ] **Step 1: Restyle the collapsed open-button** — in the `if (!expanded)` block, change the button `style` props: `borderTop: "2px solid var(--accent)"` stays; add `boxShadow: "0 -6px 16px -8px rgba(40,28,12,0.4)"`; change the `📝 Clue Tracker` label text to `🗒️ Clue Notebook`.

- [ ] **Step 2: Restyle the open drawer** — change the drawer `<div role="dialog">` `background: "var(--surface)"` stays; add `border: "1px solid var(--line)"` and `boxShadow: "0 -20px 40px -20px rgba(0,0,0,0.5)"`. Change `<h3 style={{ margin: 0 }}>Clue Tracker</h3>` to `Clue Notebook`.

- [ ] **Step 3: Restyle the add-clue input** — change its `style` `background: "var(--bg)"` to `background: "var(--surface-2)"`, `border: "1px solid var(--surface-2)"` to `border: "1px solid var(--line)"`, and add `fontFamily: "var(--hand)"`.

- [ ] **Step 4: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/ClueTracker/ClueTracker.tsx && git commit -m "M-reskin: ClueTracker notebook surface"
```

### Task 18: ClueEditor (handwriting, ink controls)

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueEditor.tsx`

- [ ] **Step 1: Restyle `wrapperStyle`** — change `background: "var(--surface-2)"` stays; change `border: focused ? "2px solid var(--accent)"` stays; add `fontFamily: "var(--hand)", fontSize: 16`.

- [ ] **Step 2: Restyle the edit `<input>`** — change `background: "var(--bg)"` to `background: "var(--surface)"`, `border: "1px solid var(--surface)"` to `border: "1px solid var(--line)"`, add `fontFamily: "var(--hand)"`.

- [ ] **Step 3: Restyle the Save button** — change its `background: "var(--accent)", color: "#1a1530"` to `background: "var(--accent)", color: "#33240c"`.

- [ ] **Step 4: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/ClueTracker/ClueEditor.tsx && git commit -m "M-reskin: ClueEditor handwriting + ink controls"
```

### Task 19: ClueCategoryTabs (filing tabs)

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/ClueTracker/ClueCategoryTabs.tsx`

- [ ] **Step 1: Replace the button `style` object** with:

```tsx
          style={{
            padding: "6px 12px",
            borderRadius: "8px 8px 4px 4px",
            border: "none",
            background: active === t.id ? "var(--accent)" : "var(--surface-2)",
            color: active === t.id ? "#33240c" : "var(--text-dim)",
            fontSize: 11.5,
            fontWeight: 700,
            fontFamily: "var(--mono)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/ClueTracker/ClueCategoryTabs.tsx && git commit -m "M-reskin: ClueCategoryTabs filing tabs"
```

### Task 20: SolutionScreen header

**Files:**
- Modify: `apps/web/src/screens/SolutionScreen/SolutionScreen.tsx`

- [ ] **Step 1: Restyle the header** — replace the `<header>` block with:

```tsx
      <header>
        <Link to={`/mysteries/${mysteryId}`} style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Back to story</Link>
        <h1 style={{ marginBottom: 4 }}>Crack the case</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 14, margin: 0 }}>{mysteryQ.data.title}</p>
      </header>
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/SolutionScreen/SolutionScreen.tsx && git commit -m "M-reskin: SolutionScreen header"
```

### Task 21: GuessForm + OptionPicker

**Files:**
- Modify: `apps/web/src/screens/SolutionScreen/GuessForm.tsx`

- [ ] **Step 1: Make the submit button rose** — change `<Button size="lg" ...>` to `<Button size="lg" variant="rose" ...>`.

- [ ] **Step 2: Replace the `OptionPicker` button `style`** with:

```tsx
            style={{
              padding: 14,
              background: active ? "rgba(192,137,43,0.16)" : "var(--surface)",
              color: "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid var(--line)",
              borderRadius: "var(--radius)",
              textAlign: "left",
              fontSize: 15,
              lineHeight: 1.5,
              cursor: "pointer",
            }}
```

- [ ] **Step 3: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/SolutionScreen/GuessForm.tsx && git commit -m "M-reskin: GuessForm casebook options + rose submit"
```

### Task 22: CharacterPicker (ID-photo suspects)

**Files:**
- Modify: `apps/web/src/screens/SolutionScreen/CharacterPicker.tsx`

- [ ] **Step 1: Replace the button `style`** with:

```tsx
            style={{
              padding: 12,
              background: active ? "rgba(192,137,43,0.16)" : "var(--surface)",
              color: "var(--text)",
              border: active ? "2px solid var(--accent)" : "2px solid var(--line)",
              borderRadius: "var(--radius)",
              textAlign: "center",
              cursor: "pointer",
            }}
```

- [ ] **Step 2: Replace the emoji block** — change `<div style={{ fontSize: 32 }}>🤔</div>` with an ID-photo monogram:

```tsx
            <div style={{
              width: 54, height: 54, margin: "0 auto 6px", borderRadius: 8,
              background: "radial-gradient(120% 120% at 30% 25%, var(--accent), #7a3b1a)",
              display: "grid", placeItems: "center", color: "#fff",
              fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, border: "3px solid #fbf4e3",
              boxShadow: active ? "0 0 0 3px var(--accent)" : "none",
            }}>{(c.name[0] ?? "?").toUpperCase()}</div>
```

- [ ] **Step 3: Style the name** — change `<div style={{ fontWeight: 700 }}>{c.name}</div>` to `<div style={{ fontWeight: 700, fontFamily: "var(--display)" }}>{c.name}</div>`.

- [ ] **Step 4: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/SolutionScreen/CharacterPicker.tsx && git commit -m "M-reskin: CharacterPicker ID-photo suspects"
```

### Task 23: RevealPanel (cream casefile + CASE CLOSED stamp)

**Files:**
- Modify: `apps/web/src/screens/SolutionScreen/RevealPanel.tsx` (full replacement)

- [ ] **Step 1: Replace the file**

```tsx
import { Link } from "react-router-dom";
import type { PublicCharacter } from "../../api/mysteries.js";
import type { SolutionResponse } from "../../api/solutions.js";
import { Button } from "../../components/Button.js";
import { Stamp } from "../../components/casebook/index.js";

function badgeFor(s: SolutionResponse["solution"]): { label: string; color: string; icon: string } {
  if (!s) return { label: "?", color: "var(--text-dim)", icon: "?" };
  if (s.gave_up) return { label: "You gave up", color: "var(--text-dim)", icon: "🙈" };
  if (s.is_correct) return { label: "Case Solved!", color: "var(--gold)", icon: "🎉" };
  const partial = (s.who_match ? 1 : 0) + (s.how_match ? 1 : 0) + (s.why_match ? 1 : 0);
  if (partial > 0) return { label: "Partly right", color: "var(--accent)", icon: "◐" };
  return { label: "Not quite", color: "var(--bad)", icon: "🧐" };
}

export function RevealPanel({ data }: { data: SolutionResponse }) {
  const b = badgeFor(data.solution);
  const solved = data.solution?.is_correct ?? false;
  const culprit = data.characters.find((c: PublicCharacter) => c.id === data.true_solution?.who_did_it);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 24, borderRadius: "var(--radius)", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 56 }}>{b.icon}</div>
        <h2 style={{ color: b.color, margin: "6px 0 0" }}>{b.label}</h2>
        {solved && (
          <div style={{ marginTop: 12 }}>
            <Stamp style={{ fontSize: 14, transform: "rotate(-8deg)", animation: "stampin .6s 250ms both" }}>Case Closed</Stamp>
          </div>
        )}
      </div>

      <div style={{ background: "var(--cream)", border: "1px solid var(--cream-line)", padding: 16, borderRadius: "var(--radius)", color: "var(--cream-ink)" }}>
        <div style={{ fontSize: 12, color: "var(--cream-ink-dim)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--display)" }}>It was…</div>
        <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, margin: "2px 0 12px" }}>
          {culprit?.name ?? data.true_solution?.who_did_it ?? "?"}
        </div>
        <p style={{ margin: "0 0 10px", lineHeight: 1.55 }}><b>How:</b> {data.true_solution?.how ?? "?"}</p>
        <p style={{ margin: 0, lineHeight: 1.55 }}><b>Why:</b> {data.true_solution?.why ?? "?"}</p>
      </div>

      {data.explanation && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 16, borderRadius: "var(--radius)", lineHeight: 1.6 }}>
          {data.explanation}
        </div>
      )}
      <Link to="/"><Button size="lg" style={{ width: "100%" }}>Back to the casebook</Button></Link>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/SolutionScreen/RevealPanel.tsx && git commit -m "M-reskin: RevealPanel cream casefile + CASE CLOSED stamp"
```

### Task 24: ClueSummary

**Files:**
- Modify: `apps/web/src/screens/SolutionScreen/ClueSummary.tsx`

- [ ] **Step 1: Restyle the container** — change `<div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)" }}>` to:

```tsx
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 16, borderRadius: "var(--radius)" }}>
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/SolutionScreen/ClueSummary.tsx && git commit -m "M-reskin: ClueSummary paper card"
```

### Task 25: HintControls

**Files:**
- Modify: `apps/web/src/screens/SolutionScreen/HintControls.tsx`

- [ ] **Step 1: Restyle the container** — change `<div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)" }}>` to add `border: "1px solid var(--line)"`.

- [ ] **Step 2: Make the hint button cream** — change `<Button variant="secondary" disabled={remaining === 0 ...}>` (the "Give me a clue" button) to `<Button variant="cream" ...>`. Leave the give-up/ghost buttons as-is.

- [ ] **Step 3: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/SolutionScreen/HintControls.tsx && git commit -m "M-reskin: HintControls paper card"
```

### Task 26: SettingsScreen (casebook sections; content unchanged)

**Files:**
- Modify: `apps/web/src/screens/SettingsScreen/SettingsScreen.tsx`

> Only restyle; the two toggles and their copy stay. (Spec 4 expands this screen.)

- [ ] **Step 1: Restyle the header** — change `<h1 style={{ margin: 0, fontSize: 28 }}>Settings</h1>` to `Grown-up Settings` and add under it a mono subtitle line. Replace the `<header>` with:

```tsx
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>🔧 Grown-up Settings</h1>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>ADMIN PANEL</div>
        </div>
        <Link to="/" style={{ color: "var(--text-dim)", textDecoration: "none", fontFamily: "var(--mono)" }}>‹ Back</Link>
      </header>
```

- [ ] **Step 2: Restyle both setting cards** — for each of the two `<div style={{ background: "var(--surface)", padding: 16, borderRadius: "var(--radius)", display: "flex", ... }}>` cards, add `border: "1px solid var(--line)"` and `boxShadow: "0 1px 4px -2px rgba(40,28,12,0.3)"`.

- [ ] **Step 3: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/SettingsScreen/SettingsScreen.tsx && git commit -m "M-reskin: SettingsScreen casebook style"
```

### Task 27: LoadingMystery

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/LoadingMystery.tsx`

- [ ] **Step 1: Swap the spin animation for floaty + add a kicker** — replace the inner block:

```tsx
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 64, animation: "floaty 2.5s ease-in-out infinite", display: "inline-block" }}>🔎</div>
        <h2 style={{ fontSize: 24, marginTop: 16 }}>The detective is on the case</h2>
        <p style={{ fontSize: 17, marginTop: 8, color: "var(--text-dim)" }}>{COPY[status]}</p>
      </div>
```

(Remove the old `<style>{` `@keyframes spin` `}</style>` line — `floaty` is global in `tokens.css`.)

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/LoadingMystery.tsx && git commit -m "M-reskin: LoadingMystery on-the-case treatment"
```

### Task 28: FailedMystery

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/FailedMystery.tsx`

- [ ] **Step 1: Restyle the inner block** — wrap the message in a paper card and use a casebook button:

```tsx
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 56 }}>🗂️</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 20, margin: "16px 0 24px", boxShadow: "0 2px 0 rgba(0,0,0,0.15)" }}>
          {msg}
        </div>
        <Link to="/"><Button size="lg">Back to the casebook</Button></Link>
      </div>
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/FailedMystery.tsx && git commit -m "M-reskin: FailedMystery paper card"
```

### Task 29: DebugPanel (dashed-red debug box)

**Files:**
- Modify: `apps/web/src/screens/PlaybackScreen/DebugPanel/DebugPanel.tsx`

- [ ] **Step 1: Restyle the `box` const** — replace it with:

```tsx
const box: CSSProperties = {
  background: "rgba(178,57,47,0.05)",
  border: "2px dashed var(--bad)",
  borderRadius: "var(--radius)",
  padding: 12,
  marginTop: 16,
  fontSize: 13,
};
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm --filter @mysterio/web typecheck && git add apps/web/src/screens/PlaybackScreen/DebugPanel/DebugPanel.tsx && git commit -m "M-reskin: DebugPanel dashed-red debug box"
```

---

## Phase D — Verification

### Task 30: Full build, leftover-dark grep, and visual pass

**Files:** none (verification only)

- [ ] **Step 1: Grep for leftover dark-theme values across the web source**

Run:
```bash
grep -rEn "#1a1530|#f5c84c|#251c44|#2f235a|#f5f1ff|#c3b6e8|#ffb74d|#f06292|rgba\(231,115,115" apps/web/src
```
Expected: no matches (every dark/old hardcoded value has been replaced). If any remain, fix them in the owning file with the casebook equivalent and re-commit under that file's task message.

- [ ] **Step 2: Typecheck the whole web package**

Run: `pnpm --filter @mysterio/web typecheck`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `pnpm --filter @mysterio/web build`
Expected: `tsc -b` + `vite build` succeed with no errors (catches unused-import errors from the screen tasks).

- [ ] **Step 4: Manual visual pass (iPad viewport)**

Run `pnpm --filter @mysterio/web dev`, open the app at an iPad-sized viewport, and walk:
PlayerPicker → MainScreen → (start a mystery / open a recent) → BriefingCard →
PlaybackScreen (cover SceneArt, narrative pills, clue notebook) → SolutionScreen
(suspects, options) → submit → RevealPanel (cream casefile + CASE CLOSED stamp).
Confirm: light paper everywhere, fonts loaded (Zilla Slab headings, Courier Prime
labels, Patrick Hand in clue inputs), no dark/purple surfaces, legible contrast.

- [ ] **Step 5: Final commit (if Step 1 required fixes; otherwise skip)**

```bash
git add -A && git commit -m "M-reskin: clean up leftover dark-theme values"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** §1 tokens/fonts → Tasks 1–2. §2 primitives (Stamp/Tape/Folder/SceneArt/SceneFrame/Chip/Kicker + Button) → Tasks 3–8. §3 per-screen list (PlayerPicker, MainScreen, CategoryGrid, DifficultyPicker, RecentList, PlaybackScreen+BriefingCard, AnnotatedNarrative, ClueTracker/ClueEditor/ClueCategoryTabs, SolutionScreen/GuessForm/CharacterPicker, RevealPanel, SettingsScreen, LoadingMystery/FailedMystery/DebugPanel/ClueSummary/HintControls) → Tasks 9–29. §4 verification (typecheck/lint/visual + leftover-dark grep) → Task 30. **Folder** is built (Task 4) though no screen consumes it yet — it is a spec-listed primitive reused by later specs (reputation/world); kept intentionally.
- **Placeholder scan:** no TBD/TODO; every code step shows code; style-edit steps name exact properties and values.
- **Type consistency:** `SceneKey`, `SCENE_FOR_CATEGORY`, `Chip` tones, `Folder` tones, and `Button` variants are defined in Tasks 3–8 and referenced consistently in Tasks 9–29.
- **Known soft spots flagged inline:** possibly-unused imports (`Kicker` in PlaybackScreen; `icon`/`CATEGORY_EMOJI` in BriefingCard) are called out with remove-if-build-errors notes, since `vite build`'s `tsc` treats unused locals as errors.
