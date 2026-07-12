export interface DragRopeProps {
  points: Array<{ x: number; y: number }> | null;
  isValid: boolean;
}

export function DragRope({ points, isValid }: DragRopeProps) {
  if (!points || points.length <= 1) return null;

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const next = points[i + 1];
    pathD += ` Q ${cur.x} ${cur.y} ${(cur.x + next.x) / 2} ${(cur.y + next.y) / 2}`;
  }
  pathD += ` T ${points[points.length - 1].x} ${points[points.length - 1].y}`;

  const tip = points[points.length - 1];
  const prev = points[points.length - 2] || points[0];
  const angle =
    (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI;

  return (
    <>
      <path
        d={pathD}
        fill="none"
        stroke="var(--canvas-amber, #EC9F05)"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="9 7"
        className="rope-dragging"
        pointerEvents="none"
      />
      <g
        transform={`translate(${tip.x}, ${tip.y}) rotate(${angle})`}
        pointerEvents="none"
      >
        {isValid ? (
          <g>
            <path
              d="M 0,0 L -12,-7"
              stroke="var(--canvas-amber, #EC9F05)"
              strokeWidth={2.4}
              strokeLinecap="round"
              className="pincer-upper"
            />
            <path
              d="M 0,0 L -12,7"
              stroke="var(--canvas-amber, #EC9F05)"
              strokeWidth={2.4}
              strokeLinecap="round"
              className="pincer-lower"
            />
          </g>
        ) : (
          <polygon
            points="-10,-5 0,0 -10,5"
            fill="var(--canvas-amber, #EC9F05)"
          />
        )}
      </g>
    </>
  );
}
