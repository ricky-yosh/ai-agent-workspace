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
}

export const DEFAULT_ROPE_CONFIG: RopeConfig = {
  points: 18,
  gravity: 0.42,
  damping: 0.82,
  slack: 0.08,
  slackOffset: 22,
  constraintPasses: 6,
};

function setRopePoint(target: RopePoint, x: number, y: number): void {
  target.x = x;
  target.y = y;
  target.px = x;
  target.py = y;
}

export function createRope(
  source: { x: number; y: number },
  target: { x: number; y: number },
  config?: Partial<RopeConfig>,
): RopePoint[] {
  const { points } = { ...DEFAULT_ROPE_CONFIG, ...config };
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nx = dist > 0 ? -dy / dist : 0;
  const ny = dist > 0 ? dx / dist : 0;

  const rope: RopePoint[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const bowAmplitude = Math.sin(Math.PI * t) * dist * 0.08;
    const x = source.x + dx * t + nx * bowAmplitude;
    const y = source.y + dy * t + ny * bowAmplitude;
    rope.push({ x, y, px: x, py: y });
  }
  return rope;
}

export function stepRope(
  rope: RopePoint[],
  source: { x: number; y: number },
  target: { x: number; y: number },
  dt: number,
  config?: Partial<RopeConfig>,
): RopePoint[] {
  const { damping, gravity, slack, slackOffset, constraintPasses } = {
    ...DEFAULT_ROPE_CONFIG,
    ...config,
  };

  const clampedDt = Math.min(dt, 0.033);

  // Point 0 is anchored to source
  setRopePoint(rope[0], source.x, source.y);

  // Verlet integration for points 1..N-1
  for (let i = 1; i < rope.length; i++) {
    const p = rope[i];
    const vx = (p.x - p.px) * damping;
    const vy = (p.y - p.py) * damping + gravity * clampedDt * 60;
    const oldX = p.x;
    const oldY = p.y;
    p.px = oldX;
    p.py = oldY;
    p.x += vx;
    p.y += vy;
  }

  // Distance constraints (struct-of-rods)
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const totalDist = Math.sqrt(dx * dx + dy * dy);
  const segCount = rope.length - 1;
  const restLength = totalDist / segCount * (1 + slack) + slackOffset;

  for (let pass = 0; pass < constraintPasses; pass++) {
    for (let i = 0; i < segCount; i++) {
      const a = rope[i];
      const b = rope[i + 1];
      const ddx = b.x - a.x;
      const ddy = b.y - a.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist === 0) continue;
      const diff = (restLength - dist) / dist * 0.5;
      const offX = ddx * diff;
      const offY = ddy * diff;
      if (i > 0) {
        a.x -= offX;
        a.y -= offY;
      }
      b.x += offX;
      b.y += offY;
    }
    // Re-anchor point 0
    rope[0].x = source.x;
    rope[0].y = source.y;
  }

  // Pull last point toward target
  const last = rope[rope.length - 1];
  const ldx = target.x - last.x;
  const ldy = target.y - last.y;
  const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
  const pullAmount = ldist > 30 ? 0.6 : 0.3;
  last.x += ldx * pullAmount;
  last.y += ldy * pullAmount;

  return rope;
}
