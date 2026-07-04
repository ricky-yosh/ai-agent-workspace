import type { Area, Screen, Vertex } from "./types/screen";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

// MUST match crates/core/src/domain/screen.rs:5-6
export const EPSILON = 1e-6;
export const MIN_AREA_SIZE = 0.05;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findVertex(screen: Screen, id: string): Vertex | undefined {
  return screen.vertices.find((v) => v.id === id);
}

/**
 * Mirror of Rust `area_bounds`; returns (left, bottom, right, top) from v1 and
 * v3. Returns null when either vertex is missing from the map.
 *
 * Used by geometry functions (pointInArea, getAdjacency) and motion functions
 * (determineEnterSeam, determineExitCollapse).
 */
function areaBounds(
  area: Area,
  vertexMap: Map<string, Vertex>,
): { left: number; bottom: number; right: number; top: number } | null {
  const v1 = vertexMap.get(area.v1);
  const v3 = vertexMap.get(area.v3);
  if (!v1 || !v3) return null;
  return { left: v1.x, bottom: v1.y, right: v3.x, top: v3.y };
}

// ---------------------------------------------------------------------------
// Client-side mirror of the Rust geometry in `crates/core/src/graph.rs`.
//
// These functions exist so a drag preview can be computed on the frontend
// with ZERO divergence from what the backend's `resize_edge` will produce
// on commit.
//
// Deliberate deviation: we do NOT replicate `cleanup()` (the coincident-vertex
// merge). For a live preview the un-cleaned geometry is visually identical
// (cleanup never repositions a vertex, only de-dupes IDs already at the same
// coordinate), and the backend runs the real cleanup on commit. As a result the
// output of `resizeEdgeLocal` may contain duplicate vertices at a coincident
// landing; callers and tests must reason about COORDINATES, not vertex counts.
// ---------------------------------------------------------------------------

/**
 * Mirror of `select_connected_vertices` (graph.rs:188-250).
 *
 * Flood-fills from the dragged edge's two endpoints, absorbing both endpoints of
 * any edge that (a) shares EXACTLY ONE already-selected vertex and (b) matches
 * the start edge's orientation. Returns the full divider's vertex set (handles
 * T-junctions: the perpendicular stub shares one vertex but fails the
 * orientation check, so only the collinear divider grows).
 *
 * Returns an empty set when the edge or either endpoint is missing.
 */
export function selectConnectedVertices(
  screen: Screen,
  edgeId: string,
): Set<string> {
  const startEdge = screen.edges.find((e) => e.id === edgeId);
  if (!startEdge) return new Set();

  const v1 = findVertex(screen, startEdge.v1);
  const v2 = findVertex(screen, startEdge.v2);
  if (!v1 || !v2) return new Set();

  const isHorizontalStart = Math.abs(v1.y - v2.y) < EPSILON;

  const selected = new Set<string>();
  selected.add(startEdge.v1);
  selected.add(startEdge.v2);

  for (;;) {
    let changed = false;
    for (const edge of screen.edges) {
      // Count how many of this edge's endpoints are already selected.
      let count = 0;
      if (selected.has(edge.v1)) count += 1;
      if (selected.has(edge.v2)) count += 1;
      if (count !== 1) continue;

      const ev1 = findVertex(screen, edge.v1);
      const ev2 = findVertex(screen, edge.v2);
      let sameDirection = false;
      if (ev1 && ev2) {
        sameDirection = isHorizontalStart
          ? Math.abs(ev1.y - ev2.y) < EPSILON
          : Math.abs(ev1.x - ev2.x) < EPSILON;
      }

      if (sameDirection) {
        if (!selected.has(edge.v1)) {
          selected.add(edge.v1);
          changed = true;
        }
        if (!selected.has(edge.v2)) {
          selected.add(edge.v2);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return selected;
}

/**
 * Mirror of `resize_edge` (graph.rs:965-1037), WITHOUT the trailing `cleanup()`.
 *
 * Moves every vertex of the dragged divider to `newPos` along its perpendicular
 * axis, clamped so no neighbouring area shrinks below MIN_AREA_SIZE and so the
 * divider stays within [0,1]. Returns a NEW Screen; the input is not mutated.
 *
 * Throws if the edge is missing, not axis-aligned, or has no connected vertices
 * — mirroring the `Err(..)` paths in the Rust (which the caller treats as
 * "leave the screen unchanged"). The renderer should guard against these (it
 * only ever drags a known axis-aligned divider), but throwing makes a misuse
 * loud rather than silently returning a degenerate screen.
 */
export function resizeEdgeLocal(
  screen: Screen,
  edgeId: string,
  newPos: number,
): Screen {
  const edge = screen.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error("Edge not found");

  // Border edges are pinned to the container boundary and must never move.
  // Return the screen unchanged rather than throwing so a stray call can't crash the UI.
  if (edge.border) return screen;

  const ev1 = findVertex(screen, edge.v1);
  const ev2 = findVertex(screen, edge.v2);
  const isHorizontal = !!ev1 && !!ev2 && Math.abs(ev1.y - ev2.y) < EPSILON;
  const isVertical = !!ev1 && !!ev2 && Math.abs(ev1.x - ev2.x) < EPSILON;
  if (!isHorizontal && !isVertical) {
    throw new Error("Edge is not axis-aligned");
  }

  const selected = selectConnectedVertices(screen, edgeId);
  if (selected.size === 0) {
    throw new Error("No connected vertices");
  }

  // current_pos = the moving axis-coordinate of any selected vertex.
  let currentPos = 0;
  for (const vid of selected) {
    const v = findVertex(screen, vid);
    if (!v) throw new Error("Missing vertex");
    currentPos = isHorizontal ? v.y : v.x;
    break;
  }

  // f64::MAX in Rust → Infinity in TS: a side with no constraining area lets the
  // final [0,1] clamp dominate.
  let bigger = Infinity;
  let smaller = Infinity;

  for (const area of screen.areas) {
    const av1 = findVertex(screen, area.v1);
    const av3 = findVertex(screen, area.v3);
    if (!av1 || !av3) throw new Error("Cannot compute area bounds");
    // area_bounds returns (v1.x, v1.y, v3.x, v3.y) = (left, bottom, right, top).
    const width = av3.x - av1.x;
    const height = av3.y - av1.y;

    if (isHorizontal) {
      const freeSpace = height - MIN_AREA_SIZE;
      // BOTTOM edge vertices (v1 AND v4) selected → area is ABOVE edge.
      if (selected.has(area.v1) && selected.has(area.v4)) {
        bigger = Math.min(bigger, freeSpace);
      }
      // TOP edge vertices (v2 AND v3) selected → area is BELOW edge.
      if (selected.has(area.v2) && selected.has(area.v3)) {
        smaller = Math.min(smaller, freeSpace);
      }
    } else {
      const freeSpace = width - MIN_AREA_SIZE;
      // LEFT edge vertices (v1 AND v2) selected → area is to the RIGHT.
      if (selected.has(area.v1) && selected.has(area.v2)) {
        bigger = Math.min(bigger, freeSpace);
      }
      // RIGHT edge vertices (v3 AND v4) selected → area is to the LEFT.
      if (selected.has(area.v3) && selected.has(area.v4)) {
        smaller = Math.min(smaller, freeSpace);
      }
    }
  }

  const clampedBySides = Math.min(
    Math.max(newPos, currentPos - smaller),
    currentPos + bigger,
  );
  const clampedPos = Math.min(Math.max(clampedBySides, 0), 1);

  const vertices: Vertex[] = screen.vertices.map((v) => {
    if (!selected.has(v.id)) return { ...v };
    // Pin any selected vertex that sits on a container boundary along the axis
    // being moved. This prevents an internal-sash flood-fill from pulling a
    // shared boundary vertex inward and opening a gap at the container edge.
    // Only the moving axis is pinned; the perpendicular coordinate is untouched.
    if (isHorizontal) {
      if (Math.abs(v.y) < EPSILON || Math.abs(v.y - 1) < EPSILON) return { ...v };
      return { ...v, y: clampedPos };
    } else {
      if (Math.abs(v.x) < EPSILON || Math.abs(v.x - 1) < EPSILON) return { ...v };
      return { ...v, x: clampedPos };
    }
  });

  return {
    vertices,
    edges: screen.edges.map((e) => ({ ...e })),
    areas: screen.areas.map((a) => ({ ...a })),
  };
}

// ---------------------------------------------------------------------------
// Point-in-area hit testing + adjacency (Bundle A of corner-drag join)
// ---------------------------------------------------------------------------

/**
 * Cliente-side mirror of Blender's `BKE_screen_find_area_xy`: returns true if
 * (nx, ny) falls within `area`'s bounding rectangle (inclusive with EPSILON
 * tolerance). Returns false if the area has missing vertices.
 */
export function pointInArea(
  nx: number,
  ny: number,
  area: Area,
  vertexMap: Map<string, Vertex>,
): boolean {
  const bounds = areaBounds(area, vertexMap);
  if (!bounds) return false;
  return (
    nx >= bounds.left - EPSILON &&
    nx <= bounds.right + EPSILON &&
    ny >= bounds.bottom - EPSILON &&
    ny <= bounds.top + EPSILON
  );
}

/** Returns the first area that contains (nx, ny), or null. */
export function findAreaAtPoint(
  areas: Area[],
  nx: number,
  ny: number,
  vertexMap: Map<string, Vertex>,
): Area | null {
  for (const area of areas) {
    if (pointInArea(nx, ny, area, vertexMap)) return area;
  }
  return null;
}

export type Adjacency = "north" | "south" | "east" | "west";

/**
 * Mirror of Rust `get_adjacency` (graph.rs:133-155). Returns the direction of
 * areaB relative to areaA, or null if they are not adjacent or overlapping.
 *
 *   north  — B is above A  (top_a ≈ bottom_b, overlap_x ≥ MIN_AREA_SIZE)
 *   south  — B is below A  (bottom_a ≈ top_b,  overlap_x ≥ MIN_AREA_SIZE)
 *   east   — B is right of A (right_a ≈ left_b, overlap_y ≥ MIN_AREA_SIZE)
 *   west   — B is left of A  (left_a ≈ right_b, overlap_y ≥ MIN_AREA_SIZE)
 */
export function getAdjacency(
  areaA: Area,
  areaB: Area,
  vertexMap: Map<string, Vertex>,
): Adjacency | null {
  const a = areaBounds(areaA, vertexMap);
  const b = areaBounds(areaB, vertexMap);
  if (!a || !b) return null;

  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);

  if (Math.abs(a.top - b.bottom) < EPSILON && overlapX >= MIN_AREA_SIZE) {
    return "north";
  }
  if (Math.abs(a.bottom - b.top) < EPSILON && overlapX >= MIN_AREA_SIZE) {
    return "south";
  }
  if (Math.abs(a.right - b.left) < EPSILON && overlapY >= MIN_AREA_SIZE) {
    return "east";
  }
  if (Math.abs(a.left - b.right) < EPSILON && overlapY >= MIN_AREA_SIZE) {
    return "west";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Corner-drag mode classification (Bundle B: split vs join vs invalid)
// ---------------------------------------------------------------------------

export type CornerDragMode = "split" | "join" | "invalid";

export interface CornerDragClassification {
  mode: CornerDragMode;
  targetAreaId: string | null;
  direction: Adjacency | null;
}

/**
 * Classify a corner drag based on cursor position relative to the grabbed area.
 *
 * Cursor in the same area               → split
 * Cursor in a DIFFERENT, adjacent area  → join (with that area as target)
 * Cursor in a non-adjacent area         → invalid
 * Cursor outside all areas              → invalid
 */
export function classifyCornerDrag(
  grabbedArea: Area,
  nx: number,
  ny: number,
  areas: Area[],
  vertexMap: Map<string, Vertex>,
): CornerDragClassification {
  const cursorArea = findAreaAtPoint(areas, nx, ny, vertexMap);
  if (cursorArea && cursorArea.id === grabbedArea.id) {
    return { mode: "split", targetAreaId: null, direction: null };
  }
  if (cursorArea) {
    const dir = getAdjacency(grabbedArea, cursorArea, vertexMap);
    if (dir !== null) {
      return { mode: "join", targetAreaId: cursorArea.id, direction: dir };
    }
    return { mode: "invalid", targetAreaId: null, direction: null };
  }
  return { mode: "invalid", targetAreaId: null, direction: null };
}

// ---------------------------------------------------------------------------
// Client-side motion support for split/join/close enter–exit FLIP.
//
// This module provides the shared diff/rect utilities needed by the exit-ghost
// (Bundle 1) and, later, the enter FLIP (Bundle 2). It stays pure and
// testable — no React, no DOM — so the renderer can reason about "what
// appeared" and "what disappeared" between any two committed screens.
//
// --- Bundle 1 (this bundle): exit ghosts only ---
//   diffAreas() tells us which areas were removed; areaRect() captures their
//   last-known geometry so we can render a ghost that fades out.
//
// --- Bundle 2 seam (enter FLIP) ---
//   diffAreas().addedIds will be consumed by a FLIP animation that grows new
//   panels from the split seam. The rect is the "Last" pose; the split
//   origin (the parent's pre-split rect) is the "First".
//
// --- Bundle 3 seam (directional collapse) ---
//   The removed areas' ghost will upgrade from a generic fade to a directional
//   collapse toward the surviving area or freed edge.
// ---------------------------------------------------------------------------

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
  const e = areaBounds(enteringArea, vertexMap);
  if (!e) return null;

  for (const sibling of screen.areas) {
    if (sibling.id === enteringArea.id) continue;

    const s = areaBounds(sibling, vertexMap);
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
  const removedBounds = areaBounds(removedArea, prevVertexMap);
  if (!removedBounds) return null;

  const removedCenterX = (removedBounds.left + removedBounds.right) / 2;
  const removedCenterY = (removedBounds.bottom + removedBounds.top) / 2;

  let bestOverlap = 0;
  let bestAbsorberBounds: { left: number; bottom: number; right: number; top: number } | null = null;

  // Scan every area in the NEW screen for overlap with the old bounds of
  // the removed area. The one with the greatest overlap area is the absorber
  // (the area that grew into the freed space after removal).
  for (const area of nextScreen.areas) {
    const b = areaBounds(area, nextVertexMap);
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
