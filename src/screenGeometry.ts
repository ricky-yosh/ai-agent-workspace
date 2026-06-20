import type { Area, Screen, Vertex } from "./types/screen";

// MUST match crates/core/src/domain/screen.rs:5-6
export const EPSILON = 1e-6;
export const MIN_AREA_SIZE = 0.05;

/**
 * Client-side mirror of the Rust geometry in `crates/core/src/graph.rs`. These
 * functions exist so a drag preview can be computed on the frontend with ZERO
 * divergence from what the backend's `resize_edge` will produce on commit.
 *
 * Deliberate deviation: we do NOT replicate `cleanup()` (the coincident-vertex
 * merge). For a live preview the un-cleaned geometry is visually identical
 * (cleanup never repositions a vertex, only de-dupes IDs already at the same
 * coordinate), and the backend runs the real cleanup on commit. As a result the
 * output of `resizeEdgeLocal` may contain duplicate vertices at a coincident
 * landing; callers and tests must reason about COORDINATES, not vertex counts.
 */

function findVertex(screen: Screen, id: string): Vertex | undefined {
  return screen.vertices.find((v) => v.id === id);
}

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
    return isHorizontal
      ? { ...v, y: clampedPos }
      : { ...v, x: clampedPos };
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
 * Mirror of Rust `area_bounds`; returns (left, bottom, right, top) from v1 and
 * v3. Returns null when either vertex is missing from the map.
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
