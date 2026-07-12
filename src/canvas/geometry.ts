export type Side = "top" | "right" | "bottom" | "left";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IdObj {
  id: string;
}

export const SIDE_NORMAL: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function nodeCenter(n: Bounds): Point {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
}

export function sideHandleCenter(n: Bounds, side: Side): Point {
  switch (side) {
    case "top":
      return { x: n.x + n.width / 2, y: n.y };
    case "bottom":
      return { x: n.x + n.width / 2, y: n.y + n.height };
    case "left":
      return { x: n.x, y: n.y + n.height / 2 };
    case "right":
      return { x: n.x + n.width, y: n.y + n.height / 2 };
  }
}

export function facingSide(n: Bounds, otherCenter: Point): Side {
  const nc = nodeCenter(n);
  const dx = otherCenter.x - nc.x;
  const dy = otherCenter.y - nc.y;
  return Math.abs(dx) > Math.abs(dy)
    ? dx >= 0
      ? "right"
      : "left"
    : dy >= 0
      ? "bottom"
      : "top";
}

export function parseSides(
  meta: string | null,
): { sourceSide?: Side; targetSide?: Side } {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta);
    return { sourceSide: parsed.sourceSide, targetSide: parsed.targetSide };
  } catch {
    return {};
  }
}

export const HANDLE_LONG = 20;
export const HANDLE_SHORT = 10;

export function halfPillPath(side: Side): string {
  const w = HANDLE_LONG / 2;
  const d = HANDLE_SHORT;
  switch (side) {
    case "top":
      return `M ${-w} 0 Q ${-w} ${-d} 0 ${-d} Q ${w} ${-d} ${w} 0 Z`;
    case "bottom":
      return `M ${-w} 0 Q ${-w} ${d} 0 ${d} Q ${w} ${d} ${w} 0 Z`;
    case "left":
      return `M 0 ${-w} Q ${-d} ${-w} ${-d} 0 Q ${-d} ${w} 0 ${w} Z`;
    case "right":
      return `M 0 ${-w} Q ${d} ${-w} ${d} 0 Q ${d} ${w} 0 ${w} Z`;
    default:
      return "";
  }
}

export function findNearestEdge(
  cx: number,
  cy: number,
  nodes: (Bounds & IdObj)[],
  edges: { id: string; source_node_id: string; target_node_id: string }[],
  threshold: number = 10,
): string | null {
  let nearestId: string | null = null;
  let nearestDist = Infinity;

  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source_node_id);
    const targetNode = nodes.find((n) => n.id === edge.target_node_id);
    if (!sourceNode || !targetNode) continue;

    const srcCx = sourceNode.x + sourceNode.width / 2;
    const srcCy = sourceNode.y + sourceNode.height / 2;
    const tgtCx = targetNode.x + targetNode.width / 2;
    const tgtCy = targetNode.y + targetNode.height / 2;

    const ddx = tgtCx - srcCx;
    const ddy = tgtCy - srcCy;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist === 0) continue;
    const curvature = Math.min(dist * 0.2, 50);
    const nx = -ddy / dist;
    const ny = ddx / dist;
    const cpX = (srcCx + tgtCx) / 2 + nx * curvature;
    const cpY = (srcCy + tgtCy) / 2 + ny * curvature;

    const getEdgePoint = (node: Bounds, tx: number, ty: number): Point => {
      const ccx = node.x + node.width / 2;
      const ccy = node.y + node.height / 2;
      const edx = tx - ccx;
      const edy = ty - ccy;
      const angle = Math.atan2(edy, edx);
      const hw = node.width / 2;
      const hh = node.height / 2;
      const tanAngle = Math.abs(Math.tan(angle));
      let ix: number, iy: number;
      if (tanAngle * hw <= hh) {
        ix = edx > 0 ? hw : -hw;
        iy = ix * Math.tan(angle);
      } else {
        iy = edy > 0 ? hh : -hh;
        ix = iy / Math.tan(angle);
      }
      return { x: ccx + ix, y: ccy + iy };
    };

    const p0 = getEdgePoint(sourceNode, cpX, cpY);
    const p2 = getEdgePoint(targetNode, cpX, cpY);
    const p1: Point = { x: cpX, y: cpY };

    const SAMPLES = 40;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const mt = 1 - t;
      const bx = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
      const by = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
      const d = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = edge.id;
      }
    }
  }

  return nearestDist <= threshold ? nearestId : null;
}
