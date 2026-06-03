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
