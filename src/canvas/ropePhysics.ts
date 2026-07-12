export interface RopePoint {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface RopeConfig {
  points: number;
  gravity: number;
  damping: number;
  slack: number;
  slackOffset: number;
  constraintPasses: number;
  launch: number;
}

export const DEFAULT_ROPE_CONFIG: RopeConfig = {
  points: 18,
  gravity: 0.42,
  damping: 0.82,
  slack: 0.08,
  slackOffset: 22,
  constraintPasses: 6,
  launch: 30,
};

export function createRope(
  source: { x: number; y: number },
  target: { x: number; y: number },
  config?: Partial<RopeConfig>,
): RopePoint[] {
  const { points } = { ...DEFAULT_ROPE_CONFIG, ...config };
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  const rope: RopePoint[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const bow = Math.sin(Math.PI * t) * 18;
    const x = source.x + dx * t;
    const y = source.y + dy * t + bow;
    rope.push({ x, y, px: x, py: y });
  }
  return rope;
}

function pinPoint(p: RopePoint, q: { x: number; y: number }): void {
  p.x = q.x;
  p.y = q.y;
  p.px = q.x;
  p.py = q.y;
}

export function stepRope(
  rope: RopePoint[],
  source: { x: number; y: number },
  target: { x: number; y: number },
  dt: number,
  config?: Partial<RopeConfig> & {
    sourceDir?: { x: number; y: number } | null;
    targetDir?: { x: number; y: number } | null;
    sagScale?: number;
    zoom?: number;
    restLengthRef?: { current: number };
  },
): RopePoint[] {
  const { damping, gravity, slack, slackOffset, constraintPasses, launch, sourceDir, targetDir, sagScale = 1, zoom = 1, restLengthRef } = {
    ...DEFAULT_ROPE_CONFIG,
    ...config,
  };

  const clampedDt = Math.min(dt, 0.033);
  const n = rope.length;
  const segCount = n - 1;

  // Compute launch-anchor positions: neighbor points pinned along the side normal
  const s1 = sourceDir
    ? { x: source.x + sourceDir.x * launch, y: source.y + sourceDir.y * launch }
    : null;
  const t1 = targetDir
    ? { x: target.x + targetDir.x * launch, y: target.y + targetDir.y * launch }
    : null;

  function isPinned(i: number): boolean {
    return i === 0 || i === n - 1 || (s1 !== null && i === 1) || (t1 !== null && i === n - 2);
  }

  // Pin endpoints and launch anchors
  pinPoint(rope[0], source);
  pinPoint(rope[n - 1], target);
  if (s1) pinPoint(rope[1], s1);
  if (t1) pinPoint(rope[n - 2], t1);

  // Verlet integration for interior points
  for (let i = 1; i < n - 1; i++) {
    if (isPinned(i)) continue;
    const p = rope[i];
    const vx = (p.x - p.px) * damping;
    const vy = (p.y - p.py) * damping + (gravity / zoom) * clampedDt * 60;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy;
  }

  // Distance constraints
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const totalDist = Math.sqrt(dx * dx + dy * dy);

  const trueSegLen = (totalDist / segCount) * (1 + slack) * sagScale + (slackOffset / segCount);
  const segLen = restLengthRef
    ? (restLengthRef.current += (trueSegLen - restLengthRef.current) * 0.18)
    : trueSegLen;

  for (let pass = 0; pass < constraintPasses; pass++) {
    pinPoint(rope[0], source);
    pinPoint(rope[n - 1], target);
    if (s1) pinPoint(rope[1], s1);
    if (t1) pinPoint(rope[n - 2], t1);

    for (let i = 0; i < segCount; i++) {
      const a = rope[i];
      const b = rope[i + 1];
      const ddx = b.x - a.x;
      const ddy = b.y - a.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist === 0) continue;
      const diff = (segLen - dist) / dist;
      const offX = ddx * diff;
      const offY = ddy * diff;

      const aPinned = isPinned(i);
      const bPinned = isPinned(i + 1);
      if (aPinned && !bPinned) {
        b.x += offX;
        b.y += offY;
      } else if (!aPinned && bPinned) {
        a.x -= offX;
        a.y -= offY;
      } else if (!aPinned && !bPinned) {
        a.x -= offX * 0.5;
        a.y -= offY * 0.5;
        b.x += offX * 0.5;
        b.y += offY * 0.5;
      }
    }
  }

  return rope;
}


