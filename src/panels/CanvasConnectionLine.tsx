import { useEffect, useRef, useCallback } from "react";
import type { ConnectionLineComponentProps, InternalNode } from "@xyflow/react";

const ROPE_SEGMENTS = 20;
const ROPE_GRAVITY = 1500;
const ROPE_DAMPING = 0.93;
const ROPE_ITERATIONS = 12;
const ROPE_SLACK = 1.014;
const ROPE_STEP = 1 / 120;

interface RopePoint {
  x: number; y: number; px: number; py: number;
}

interface RopeState {
  pts: RopePoint[];
  restTotal: number;
  slack: number;
  still: number;
}

function makeRope(a: { x: number; y: number }, b: { x: number; y: number }): RopeState {
  const pts: RopePoint[] = [];
  for (let i = 0; i <= ROPE_SEGMENTS; i++) {
    const k = i / ROPE_SEGMENTS;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    pts.push({ x, y, px: x, py: y });
  }
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  return { pts, restTotal: Math.max(40, dist) * ROPE_SLACK, slack: 1, still: 0 };
}

function stepRope(r: RopeState, a: { x: number; y: number }, b: { x: number; y: number }, dt: number): boolean {
  const pts = r.pts;
  const last = pts.length - 1;
  const pins: [number, { x: number; y: number }][] = [[0, a]];
  pins.push([last, b]);

  let moved = 0;
  for (const [i, pt] of pins) {
    moved = Math.max(moved, Math.abs(pts[i].x - pt.x) + Math.abs(pts[i].y - pt.y));
  }

  const i0 = 0;
  const i1 = last;
  const freeDist = Math.hypot(b.x - a.x, b.y - a.y);
  const target = Math.max(30, freeDist) * ROPE_SLACK * r.slack;
  const drifting = Math.abs(r.slack - 1) > 0.002 || Math.abs(r.restTotal - target) > 0.5;

  if (r.still >= 24 && moved < 0.01 && !drifting) return false;

  r.slack += (1 - r.slack) * Math.min(1, dt * 3.4);
  r.restTotal += (target - r.restTotal) * Math.min(1, dt * 9);
  const seg = r.restTotal / (i1 - i0);

  const pinned = new Set(pins.map((p) => p[0]));
  const damp = Math.pow(ROPE_DAMPING, dt * 60);
  for (let i = 0; i <= last; i++) {
    if (pinned.has(i)) continue;
    const p = pts[i];
    const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
    p.px = p.x; p.py = p.y;
    p.x += vx;
    p.y += vy + ROPE_GRAVITY * dt * dt;
    moved = Math.max(moved, Math.abs(vx) + Math.abs(vy));
  }
  for (const [i, pt] of pins) {
    const p = pts[i];
    p.x = pt.x; p.y = pt.y; p.px = pt.x; p.py = pt.y;
  }
  for (let k = 0; k < ROPE_ITERATIONS; k++) {
    for (let i = i0; i < i1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const k2 = ((d - seg) / d) * 0.5;
      const ox = dx * k2, oy = dy * k2;
      if (!pinned.has(i)) { p1.x += ox; p1.y += oy; }
      if (!pinned.has(i + 1)) { p2.x -= ox; p2.y -= oy; }
    }
  }
  r.still = moved > 0.06 || drifting ? 0 : r.still + 1;
  return true;
}

function ropePathD(pts: RopePoint[]): string {
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export default function CanvasConnectionLine({
  fromX, fromY, toX, toY,
  fromNode, toNode,
}: ConnectionLineComponentProps) {
  const ropeRef = useRef<RopeState | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevTargetRef = useRef<{ x: number; y: number }>({ x: toX, y: toY });

  // Compute source anchor point (center of source handle side)
  const getSourcePoint = useCallback((): { x: number; y: number } => {
    if (!fromNode) return { x: fromX, y: fromY };
    const n = fromNode as InternalNode;
    const hw = (n.measured?.width ?? n.width ?? 200) / 2;
    const hh = (n.measured?.height ?? n.height ?? 100) / 2;
    const px = n.position.x;
    const py = n.position.y;
    // Default to right side center
    return { x: px + hw * 2, y: py + hh };
  }, [fromX, fromY, fromNode]);

  // Initialize rope on first mount or when source changes significantly
  useEffect(() => {
    const src = getSourcePoint();
    if (!ropeRef.current || fromNode) {
      ropeRef.current = makeRope(src, { x: toX, y: toY });
    }
    prevTargetRef.current = { x: toX, y: toY };

    let ropeAcc = 0;
    let lastTime = 0;

    const tick = (time: number) => {
      const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : ROPE_STEP;
      lastTime = time;
      ropeAcc = Math.min(ropeAcc + dt, 0.1);
      let steps = 0;
      while (ropeAcc >= ROPE_STEP) {
        ropeAcc -= ROPE_STEP;
        const r = ropeRef.current;
        if (r) stepRope(r, src, prevTargetRef.current, ROPE_STEP);
        if (++steps > 8) { ropeAcc = 0; break; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [fromX, fromY, fromNode]);

  // Update target position
  useEffect(() => {
    prevTargetRef.current = { x: toX, y: toY };
    if (ropeRef.current) {
      ropeRef.current.still = 0;
    }
  }, [toX, toY]);

  const rope = ropeRef.current;
  if (!rope) return null;

  const pathD = ropePathD(rope.pts);
  const last = rope.pts.length - 1;
  const tip = rope.pts[last];
  const prev = rope.pts[last - 1] || rope.pts[0];
  const angle = (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI;
  const hasTarget = !!toNode;

  return (
    <g pointerEvents="none">
      <path
        d={pathD}
        fill="none"
        stroke="var(--canvas-amber, #EC9F05)"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="9 7"
        className="rope-dragging"
      />
      <g transform={`translate(${tip.x}, ${tip.y}) rotate(${angle})`}>
        {hasTarget ? (
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
    </g>
  );
}
