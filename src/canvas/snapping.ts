export interface SnappingResult {
  side: 'top' | 'right' | 'bottom' | 'left';
  distance: number;
  midpoint: { x: number; y: number };
}

export function findNearestHandle(
  point: { x: number; y: number },
  nodeRect: { x: number; y: number; width: number; height: number },
): SnappingResult {
  const hw = nodeRect.width / 2;
  const hh = nodeRect.height / 2;

  const candidates: Array<{ side: SnappingResult['side']; midpoint: { x: number; y: number } }> = [
    { side: 'top', midpoint: { x: nodeRect.x + hw, y: nodeRect.y } },
    { side: 'right', midpoint: { x: nodeRect.x + nodeRect.width, y: nodeRect.y + hh } },
    { side: 'bottom', midpoint: { x: nodeRect.x + hw, y: nodeRect.y + nodeRect.height } },
    { side: 'left', midpoint: { x: nodeRect.x, y: nodeRect.y + hh } },
  ];

  let best = candidates[0];
  let bestDist = Math.hypot(point.x - best.midpoint.x, point.y - best.midpoint.y);

  for (let i = 1; i < candidates.length; i++) {
    const dist = Math.hypot(point.x - candidates[i].midpoint.x, point.y - candidates[i].midpoint.y);
    if (dist < bestDist) {
      best = candidates[i];
      bestDist = dist;
    }
  }

  return { side: best.side, distance: bestDist, midpoint: best.midpoint };
}
