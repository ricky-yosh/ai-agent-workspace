import type { Screen, Area, Vertex } from "./types/screen";

/**
 * Client-side motion support for split/join/close enter–exit FLIP.
 *
 * This module provides the shared diff/rect utilities needed by the exit-ghost
 * (Bundle 1) and, later, the enter FLIP (Bundle 2). It stays pure and
 * testable — no React, no DOM — so the renderer can reason about "what
 * appeared" and "what disappeared" between any two committed screens.
 *
 * --- Bundle 1 (this bundle): exit ghosts only ---
 *   diffAreas() tells us which areas were removed; areaRect() captures their
 *   last-known geometry so we can render a ghost that fades out.
 *
 * --- Bundle 2 seam (enter FLIP) ---
 *   diffAreas().addedIds will be consumed by a FLIP animation that grows new
 *   panels from the split seam. The rect is the "Last" pose; the split
 *   origin (the parent's pre-split rect) is the "First".
 *
 * --- Bundle 3 seam (directional collapse) ---
 *   The removed areas' ghost will upgrade from a generic fade to a directional
 *   collapse toward the surviving area or freed edge.
 */

// ---------------------------------------------------------------------------
// Reduced-motion
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the user prefers reduced motion.
 *
 * This is the **single JS source of truth** for the feature. All exit/enter
 * decisions consult it. We guard against environments without `matchMedia`
 * (SSR / jsdom) and return `false` so animations degrade gracefully to instant.
 */
export function prefersReducedMotion(): boolean {
  if (typeof document !== "undefined") {
    const m = document.documentElement.dataset.motion;
    if (m === "reduced") return true;
    if (m === "full") return false;
  }
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------------------------------------------------------------------------
// Rect utilities
// ---------------------------------------------------------------------------

/** Percentage-based (0-100) rectangle for positioning an area in the renderer. */
export interface AreaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Extract the renderer's computed rect for an area.
 *
 * Mirror of the inline math in ScreenRenderer's area loop:
 *   left = v1.x * 100
 *   top  = (1 - v2.y) * 100
 *   width  = (v3.x - v1.x) * 100
 *   height = (v2.y - v1.y) * 100
 *
 * Returns `null` when any referenced vertex is missing from the map — the
 * caller must handle this gracefully (skip the ghost).
 */
export function areaRect(
  area: Area,
  vertexMap: Map<string, Vertex>,
): AreaRect | null {
  const v1 = vertexMap.get(area.v1);
  const v2 = vertexMap.get(area.v2);
  const v3 = vertexMap.get(area.v3);
  const v4 = vertexMap.get(area.v4);
  if (!v1 || !v2 || !v3 || !v4) return null;

  return {
    left: v1.x * 100,
    top: (1 - v2.y) * 100,
    width: (v3.x - v1.x) * 100,
    height: (v2.y - v1.y) * 100,
  };
}

// ---------------------------------------------------------------------------
// Screen diff
// ---------------------------------------------------------------------------

/** The symmetric difference between two screens' area sets. */
export interface AreaDiff {
  /** Area IDs present in `next` but not in `prev`. */
  addedIds: Set<string>;
  /** Full Area objects present in `prev` but not in `next` (vertices still resolvable from the OLD screen). */
  removed: Area[];
}

/**
 * Classify which areas were added and which were removed.
 *
 * When `prev` is `null` (first render) both sets are empty — we must NOT
 * animate the initial paint.
 *
 * IMPORTANT — critical gating for Bundle 1 + #1 (live resize):
 *   A pure geometry commit (sash resize that only moves vertices) produces
 *   `addedIds.size === 0 && removed.length === 0` because the area *set*
 *   is unchanged. The effect gating on this prevents ghost/enter work for
 *   the settle-after-drag path, avoiding a double-animation where the
 *   exiting transition (.screen-area geometry transition) fights a FLIP.
 */
export function diffAreas(prev: Screen | null, next: Screen): AreaDiff {
  const addedIds = new Set<string>();
  const removed: Area[] = [];

  if (!prev) {
    // First render — nothing animates in or out.
    return { addedIds, removed };
  }

  const prevIds = new Set(prev.areas.map((a) => a.id));
  const nextIds = new Set(next.areas.map((a) => a.id));

  for (const id of nextIds) {
    if (!prevIds.has(id)) {
      addedIds.add(id);
    }
  }

  for (const area of prev.areas) {
    if (!nextIds.has(area.id)) {
      removed.push(area);
    }
  }

  return { addedIds, removed };
}

// ---------------------------------------------------------------------------
// Seam detection (Bundle 2: enter FLIP origin)
// ---------------------------------------------------------------------------

/**
 * EPSILON for geometric comparisons in seam detection.
 * Operates in raw coordinate space [0,1] where vertex positions live.
 */
const EPSILON = 1e-6;

/**
 * Describes how an entering panel should animate from its split seam.
 *
 * `transformOrigin` — CSS value anchoring the scale (e.g. `'left center'`).
 * `scaleAxis`      — `'scaleX'` for vertical seams (side-by-side panels),
 *                    `'scaleY'` for horizontal seams (stacked panels).
 */
export interface SeamSide {
  transformOrigin: string;
  scaleAxis: "scaleX" | "scaleY";
}

// ---------------------------------------------------------------------------
// Raw bounding box in the [0,1] vertex coordinate system.
// v1 = bottom-left, v2 = top-left, v3 = top-right, v4 = bottom-right.
// ---------------------------------------------------------------------------
interface RawBounds {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

/**
 * Extract an area's bounding box in raw [0,1] coordinates from a vertex map.
 * Returns `null` when any referenced vertex is missing.
 */
function rawAreaBounds(
  area: Area,
  vertexMap: Map<string, Vertex>,
): RawBounds | null {
  const v1 = vertexMap.get(area.v1);
  const v2 = vertexMap.get(area.v2);
  const v3 = vertexMap.get(area.v3);
  const v4 = vertexMap.get(area.v4);
  if (!v1 || !v2 || !v3 || !v4) return null;
  return { left: v1.x, bottom: v1.y, right: v3.x, top: v3.y };
}

/**
 * Determine the seam (shared edge) between an entering area and the
 * surviving sibling it was split off from.
 *
 * The function scans every other area in the screen looking for one that
 * shares an axis-aligned border with the entering area. Once found it
 * returns the CSS `transform-origin` and `scaleAxis` that make the enter
 * FLIP grow the panel FROM that shared divider rather than from its center.
 *
 * ## Vertical seam (panels side-by-side)
 *
 *   The two areas share the same y-span (top/bottom coincide) and touch
 *   along x: one area's left-edge equals the other's right-edge.
 *   The entering panel is either to the RIGHT of the sibling (seam at its
 *   left edge → `'left center'`) or to the LEFT (seam at its right edge →
 *   `'right center'`). The FLIP scales `scaleX(0)→scaleX(1)`.
 *
 * ## Horizontal seam (panels stacked)
 *
 *   The two areas share the same x-span (left/right coincide) and touch
 *   along y in the raw coordinate system. Due to CSS y-flip, an area
 *   BELOW its sibling (lower raw y-values) has the seam at its CSS TOP
 *   edge → `'top center'`. An area ABOVE its sibling has the seam at its
 *   CSS BOTTOM edge → `'bottom center'`. The FLIP scales `scaleY(0)→scaleY(1)`.
 *
 * ## Fallback
 *
 *   Returns `null` when no unambiguous adjacent sibling is found. The
 *   caller should then use a center-scale + opacity entrance so the
 *   panel never blinks in.
 */
export function determineEnterSeam(
  enteringArea: Area,
  screen: Screen,
  vertexMap: Map<string, Vertex>,
): SeamSide | null {
  const e = rawAreaBounds(enteringArea, vertexMap);
  if (!e) return null;

  for (const sibling of screen.areas) {
    if (sibling.id === enteringArea.id) continue;

    const s = rawAreaBounds(sibling, vertexMap);
    if (!s) continue;

    // --- Vertical seam check (side-by-side, y-spans overlap) ---
    const yOverlap = Math.min(e.top, s.top) - Math.max(e.bottom, s.bottom);
    if (yOverlap > EPSILON) {
      if (Math.abs(e.left - s.right) < EPSILON) {
        // Entering is to the RIGHT of sibling. Its left edge sits on the
        // seam. Transform-origin 'left center' anchors scaleX so the
        // panel expands rightward from that fixed-left edge.
        return { transformOrigin: "left center", scaleAxis: "scaleX" };
      }
      if (Math.abs(e.right - s.left) < EPSILON) {
        // Entering is to the LEFT of sibling. Its right edge sits on the
        // seam. Transform-origin 'right center' anchors scaleX so the
        // panel expands leftward from that fixed-right edge.
        return { transformOrigin: "right center", scaleAxis: "scaleX" };
      }
    }

    // --- Horizontal seam check (stacked, x-spans overlap) ---
    const xOverlap = Math.min(e.right, s.right) - Math.max(e.left, s.left);
    if (xOverlap > EPSILON) {
      if (Math.abs(e.top - s.bottom) < EPSILON) {
        // Entering's raw top coincides with sibling's raw bottom.
        // Entering is BELOW sibling in raw coords (lower y-values). In
        // rendered CSS the seam is at the entering panel's TOP edge.
        // Origin 'top center' makes scaleY expand downward from the seam.
        return { transformOrigin: "top center", scaleAxis: "scaleY" };
      }
      if (Math.abs(e.bottom - s.top) < EPSILON) {
        // Entering's raw bottom coincides with sibling's raw top.
        // Entering is ABOVE sibling. In rendered CSS the seam is at the
        // entering panel's BOTTOM edge.
        // Origin 'bottom center' makes scaleY expand upward from the seam.
        return { transformOrigin: "bottom center", scaleAxis: "scaleY" };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Exit collapse (Bundle 3: directional ghost collapse toward absorber)
// ---------------------------------------------------------------------------

/**
 * Determine the direction a removed area should collapse toward based on
 * which surviving area in the new screen overlaps its old position the most.
 *
 * The **absorber** is the area in `nextScreen` whose NEW bounds OVERLAP
 * the removed area's OLD bounds with the greatest overlap area. This works
 * uniformly for both close and join — whichever panel grew into the freed
 * space is the absorber.
 *
 * Once the absorber is found its center is compared against the removed
 * area's old center. The dominant axis decides scaleX vs scaleY; the sign
 * decides which edge the ghost collapses TOWARD (the seam facing the
 * absorber).
 *
 * NOTE — Inverse of `determineEnterSeam`:
 *   Enter grows  FROM the seam (scale 0→1 away from the shared edge).
 *   Exit  collapses INTO the seam toward the absorber (scale 1→0 toward
 *   the shared edge).
 *
 *   Absorber to the right → ghost collapses rightward (right edge pinned).
 *   Absorber to the left  → ghost collapses leftward  (left  edge pinned).
 *   Absorber above (higher raw y) → ghost collapses upward  (top edge pinned).
 *   Absorber below (lower  raw y) → ghost collapses downward (bottom edge pinned).
 *
 * Returns `null` when no overlapping survivor is found; the caller should
 * fall back to a plain fade (center-scale + opacity).
 */
export function determineExitCollapse(
  removedArea: Area,
  prevVertexMap: Map<string, Vertex>,
  nextScreen: Screen,
  nextVertexMap: Map<string, Vertex>,
): SeamSide | null {
  const removedBounds = rawAreaBounds(removedArea, prevVertexMap);
  if (!removedBounds) return null;

  const removedCenterX = (removedBounds.left + removedBounds.right) / 2;
  const removedCenterY = (removedBounds.bottom + removedBounds.top) / 2;

  let bestOverlap = 0;
  let bestAbsorberBounds: RawBounds | null = null;

  // Scan every area in the NEW screen for overlap with the old bounds of
  // the removed area. The one with the greatest overlap area is the absorber
  // (the area that grew into the freed space after removal).
  for (const area of nextScreen.areas) {
    const b = rawAreaBounds(area, nextVertexMap);
    if (!b) continue;

    const xOverlap = Math.max(
      0,
      Math.min(removedBounds.right, b.right) - Math.max(removedBounds.left, b.left),
    );
    const yOverlap = Math.max(
      0,
      Math.min(removedBounds.top, b.top) - Math.max(removedBounds.bottom, b.bottom),
    );
    const overlap = xOverlap * yOverlap;

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestAbsorberBounds = b;
    }
  }

  // No overlapping survivor — caller falls back to a plain fade.
  if (!bestAbsorberBounds || bestOverlap <= EPSILON) return null;

  // Center delta: absorber center minus removed center.
  const absCenterX = (bestAbsorberBounds.left + bestAbsorberBounds.right) / 2;
  const absCenterY = (bestAbsorberBounds.bottom + bestAbsorberBounds.top) / 2;
  const dx = absCenterX - removedCenterX;
  const dy = absCenterY - removedCenterY;

  // Dominant axis determines whether we scale horizontally or vertically.
  // The sign decides which side the ghost collapses toward (the seam).
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal dominance — collapse left or right via scaleX.
    if (dx > 0) {
      // Absorber is to the RIGHT → collapse rightward (right edge pinned).
      return { transformOrigin: "right center", scaleAxis: "scaleX" };
    }
    // Absorber is to the LEFT → collapse leftward (left edge pinned).
    return { transformOrigin: "left center", scaleAxis: "scaleX" };
  }

  // Vertical dominance — collapse up or down via scaleY.
  if (dy > 0) {
    // Absorber is ABOVE (higher raw y) → collapse upward (top edge pinned).
    return { transformOrigin: "top center", scaleAxis: "scaleY" };
  }
  // Absorber is BELOW (lower raw y) → collapse downward (bottom edge pinned).
  return { transformOrigin: "bottom center", scaleAxis: "scaleY" };
}
