import { Route, Routes as RRRoutes } from "react-router-dom";

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 24 }}>{name} (placeholder)</div>;
}

export function Routes() {
  return (
    <RRRoutes>
      <Route path="/" element={<Placeholder name="Home" />} />
      <Route path="/mysteries/:id" element={<Placeholder name="Playback" />} />
      <Route path="/mysteries/:id/solve" element={<Placeholder name="Solve" />} />
    </RRRoutes>
  );
}
