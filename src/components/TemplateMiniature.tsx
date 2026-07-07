import type { Screen } from "../types/screen";

interface TemplateMiniatureProps {
  screen: Screen;
  width?: number;
  height?: number;
}

const PANEL_COLORS = [
  "rgba(124, 58, 237, 0.25)",
  "rgba(56, 139, 253, 0.25)",
  "rgba(39, 174, 96, 0.25)",
  "rgba(242, 153, 74, 0.25)",
  "rgba(155, 89, 182, 0.25)",
  "rgba(52, 152, 219, 0.25)",
  "rgba(241, 196, 15, 0.25)",
  "rgba(231, 76, 60, 0.25)",
];

export default function TemplateMiniature({
  screen,
  width = 140,
  height = 100,
}: TemplateMiniatureProps) {
  if (screen.vertices.length === 0 || screen.areas.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
          fontSize: 11,
        }}
      >
        empty
      </div>
    );
  }

  const vertexMap = new Map<string, { x: number; y: number }>();
  for (const v of screen.vertices) {
    vertexMap.set(v.id, { x: v.x, y: v.y });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of screen.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }

  const sourceW = maxX - minX || 1;
  const sourceH = maxY - minY || 1;

  const gutterPx = 4;
  const availableW = width - gutterPx * 2;
  const availableH = height - gutterPx * 2;
  const scale = Math.min(availableW / sourceW, availableH / sourceH);
  const offsetX = (width - sourceW * scale) / 2 - minX * scale;
  const offsetY = (height - sourceH * scale) / 2 - minY * scale;

  function getAreaRect(area: { v1: string; v2: string; v3: string; v4: string }) {
    const v1 = vertexMap.get(area.v1);
    const v3 = vertexMap.get(area.v3);
    if (!v1 || !v3) return null;
    const left = Math.min(v1.x, v3.x);
    const top = Math.min(v1.y, v3.y);
    const right = Math.max(v1.x, v3.x);
    const bottom = Math.max(v1.y, v3.y);
    return {
      x: left * scale + offsetX,
      y: top * scale + offsetY,
      w: Math.max(2, (right - left) * scale),
      h: Math.max(2, (bottom - top) * scale),
    };
  }

  return (
    <div style={{ position: "relative", width, height, overflow: "hidden" }}>
      {screen.areas.map((area, i) => {
        const rect = getAreaRect(area);
        if (!rect) return null;
        return (
          <div
            key={area.id}
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              background: PANEL_COLORS[i % PANEL_COLORS.length],
              border: "1px solid var(--border)",
              borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
        );
      })}
      {screen.edges
        .filter((e) => e.border)
        .map((edge) => {
          const a = vertexMap.get(edge.v1);
          const b = vertexMap.get(edge.v2);
          if (!a || !b) return null;
          const x1 = a.x * scale + offsetX;
          const y1 = a.y * scale + offsetY;
          const x2 = b.x * scale + offsetX;
          const y2 = b.y * scale + offsetY;

          const isHorizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
          return (
            <div
              key={edge.id}
              style={{
                position: "absolute",
                left: isHorizontal ? Math.min(x1, x2) : x1 - 1,
                top: isHorizontal ? y1 - 1 : Math.min(y1, y2),
                width: isHorizontal ? Math.abs(x2 - x1) : 2,
                height: isHorizontal ? 2 : Math.abs(y2 - y1),
                background: "var(--border)",
              }}
            />
          );
        })}
    </div>
  );
}
