import { memo } from "react";
import { BaseEdge, useInternalNode, useStore, type EdgeProps } from "@xyflow/react";
import { resolveNearestFacingSides, sideHandleCenter, SIDE_NORMAL } from "../canvas/geometry";
import { computeDragRope, type RopePoint } from "../canvas/ropePhysics";

// Buffer between a card border and where its edge visually attaches.
const EDGE_GAP = 8;

interface Vec {
  x: number;
  y: number;
}

// Arrowhead as a stroked chevron that flows out of the line's tip along the edge's
// real direction of travel — computed from the rope point chain, not the card
// normal — so the head reads as the line continuing rather than a triangle stuck on
// at a mismatched angle.
const ARROW_LEN = 10;
const ARROW_ANGLE = 0.5; // radians per arm off the shaft (~28°)

// Unit direction of travel into an endpoint, from the last non-degenerate segment of
// the point chain. `atEnd` picks the target tip (walk back from the end); otherwise
// the source tip (walk forward from the start). Falls back to `normal` when every
// sampled point coincides.
function endDir(pts: RopePoint[], atEnd: boolean, normal: Vec): Vec {
  const n = pts.length;
  const tip = atEnd ? pts[n - 1] : pts[0];
  const step = atEnd ? -1 : 1;
  for (let i = atEnd ? n - 2 : 1; i >= 0 && i < n; i += step) {
    const dx = tip.x - pts[i].x;
    const dy = tip.y - pts[i].y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) return { x: dx / len, y: dy / len };
  }
  return normal;
}

function chevron(tip: Vec, dir: Vec): string {
  const cos = Math.cos(ARROW_ANGLE);
  const sin = Math.sin(ARROW_ANGLE);
  const back = { x: -dir.x, y: -dir.y };
  const a1 = {
    x: tip.x + (back.x * cos - back.y * sin) * ARROW_LEN,
    y: tip.y + (back.x * sin + back.y * cos) * ARROW_LEN,
  };
  const a2 = {
    x: tip.x + (back.x * cos + back.y * sin) * ARROW_LEN,
    y: tip.y + (-back.x * sin + back.y * cos) * ARROW_LEN,
  };
  return `M ${a1.x} ${a1.y} L ${tip.x} ${tip.y} L ${a2.x} ${a2.y}`;
}

// Stitch the rope point-chain into a silky path using each consecutive pair's
// midpoint as a quadratic endpoint — the same technique the live drag rope uses.
function ropePath(pts: RopePoint[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i];
    const n = pts[i + 1];
    d += ` Q ${c.x} ${c.y} ${(c.x + n.x) / 2} ${(c.y + n.y) / 2}`;
  }
  const l = pts[pts.length - 1];
  d += ` T ${l.x} ${l.y}`;
  return d;
}

function CanvasEdge({ id, source, target, selected, label }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // The reverse edge (target→source), if one exists, makes this a bidirectional
  // pair. We draw such a pair once — the smaller id wins — so two overlapping
  // curves collapse into a single double-headed edge.
  const reverse = useStore((s) =>
    s.edges.find((e) => e.source === target && e.target === source),
  );
  if (!sourceNode || !targetNode) return null;
  const bidirectional = Boolean(reverse);
  if (reverse && reverse.id < id) return null;

  const sourceBounds = {
    x: sourceNode.internals.positionAbsolute.x,
    y: sourceNode.internals.positionAbsolute.y,
    width: sourceNode.measured.width ?? 0,
    height: sourceNode.measured.height ?? 0,
  };
  const targetBounds = {
    x: targetNode.internals.positionAbsolute.x,
    y: targetNode.internals.positionAbsolute.y,
    width: targetNode.measured.width ?? 0,
    height: targetNode.measured.height ?? 0,
  };

  // Each endpoint resolves to the side facing the other node — the connection
  // dot that visually faces the peer — recomputed every render so the edge
  // re-picks its dots as the nodes move.
  const { srcSide, tgtSide } = resolveNearestFacingSides(sourceBounds, targetBounds);
  const srcDir = SIDE_NORMAL[srcSide];
  const tgtDir = SIDE_NORMAL[tgtSide];
  const srcCenter = sideHandleCenter(sourceBounds, srcSide);
  const tgtCenter = sideHandleCenter(targetBounds, tgtSide);
  // Nudge each endpoint outward along its side normal so the curve breathes off
  // the card border instead of touching it.
  const sourceDot = { x: srcCenter.x + srcDir.x * EDGE_GAP, y: srcCenter.y + srcDir.y * EDGE_GAP };
  const targetDot = { x: tgtCenter.x + tgtDir.x * EDGE_GAP, y: tgtCenter.y + tgtDir.y * EDGE_GAP };

  // The verlet drag rope at rest: the same droop shape, computed directly with
  // no physics loop. Side normals launch the curve perpendicular out of each dot.
  const pts = computeDragRope(sourceDot, targetDot, {
    sourceDir: srcDir,
    targetDir: tgtDir,
    launch: 0,
  });
  const edgePath = ropePath(pts);

  const labelX = (sourceDot.x + targetDot.x) / 2;
  const labelY = (sourceDot.y + targetDot.y) / 2;

  const stroke = selected ? "var(--accent)" : "var(--text-muted)";
  const strokeWidth = selected ? 2 : 1.5;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke, strokeWidth }} />
      <path
        d={chevron(targetDot, endDir(pts, true, tgtDir))}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {bidirectional && (
        <path
          d={chevron(sourceDot, endDir(pts, false, srcDir))}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {label && (
        <foreignObject
          width={1}
          height={1}
          x={labelX}
          y={labelY}
          style={{ overflow: "visible" }}
        >
          <div
            style={{
              transform: "translate(-50%, -50%)",
              padding: "2px 6px",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-xs, 3px)",
              fontSize: "11px",
              color: "var(--text-dim)",
              whiteSpace: "nowrap",
              pointerEvents: "all",
            }}
          >
            {label}
          </div>
        </foreignObject>
      )}
    </>
  );
}

export default memo(CanvasEdge);
