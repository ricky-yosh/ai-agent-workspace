export interface RopePoint {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * Directly computes a rope-look curve from the current source/target position —
 * no integration, no previous-frame state, no settling. Matches clapet.app's
 * approach (confirmed by decompiling its editor bundle: it has zero physics
 * simulation anywhere in the diagram canvas) of recomputing the curve fresh on
 * every pointer move rather than simulating toward it, which is what makes
 * their drag/reconnect line lag-free.
 */
export function computeDragRope(
  source: { x: number; y: number },
  target: { x: number; y: number },
  opts: {
    sourceDir?: { x: number; y: number } | null;
    targetDir?: { x: number; y: number } | null;
    points?: number;
    launch?: number;
    sag?: number;
    maxSag?: number;
  } = {},
): RopePoint[] {
  const { points = 18, launch = 30, sag = 0.12, maxSag = 60, sourceDir, targetDir } = opts;

  const s1 = sourceDir
    ? { x: source.x + sourceDir.x * launch, y: source.y + sourceDir.y * launch }
    : source;
  const t1 = targetDir
    ? { x: target.x + targetDir.x * launch, y: target.y + targetDir.y * launch }
    : target;

  const dx = t1.x - s1.x;
  const dy = t1.y - s1.y;
  const dist = Math.hypot(dx, dy);
  const bowAmount = Math.min(maxSag, dist * sag);
  const nx = dist === 0 ? 0 : -dy / dist;
  const ny = dist === 0 ? 1 : dx / dist;
  const sagSign = ny >= 0 ? 1 : -1;

  const rope: RopePoint[] = [{ x: source.x, y: source.y, px: source.x, py: source.y }];
  for (let i = 1; i < points - 1; i++) {
    const t = i / (points - 1);
    const bow = Math.sin(Math.PI * t) * bowAmount * sagSign;
    const x = s1.x + dx * t + nx * bow;
    const y = s1.y + dy * t + ny * bow;
    rope.push({ x, y, px: x, py: y });
  }
  rope.push({ x: target.x, y: target.y, px: target.x, py: target.y });
  return rope;
}

/**
 * Sine-sag curve matching clapet.app's settled/live edge geometry (function
 * `bn` in their bundle): points interpolate linearly from source to target,
 * then droop vertically by `sin(pi * t) * sag`, where sag is the distance
 * clamped to [18, 90]px and scaled by `sagScale` (1 at rest, ~1.32 while a
 * connection endpoint is actively being dragged).
 */
export function computeEdgeSagPoints(
  source: { x: number; y: number },
  target: { x: number; y: number },
  opts: { points?: number; sagScale?: number } = {},
): Array<{ x: number; y: number }> {
  const { points = 16, sagScale = 1 } = opts;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.hypot(dx, dy);
  const sag = Math.min(90, Math.max(18, dist * 0.12)) * sagScale;

  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    pts.push({ x: source.x + dx * t, y: source.y + dy * t + Math.sin(Math.PI * t) * sag });
  }
  return pts;
}
