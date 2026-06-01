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
