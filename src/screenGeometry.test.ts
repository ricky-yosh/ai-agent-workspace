import { describe, it, expect } from "vitest";
import type { Area, Screen, Vertex } from "./types/screen";
import {
  EPSILON,
  MIN_AREA_SIZE,
  classifyCornerDrag,
  findAreaAtPoint,
  getAdjacency,
  pointInArea,
  resizeEdgeLocal,
  selectConnectedVertices,
} from "./screenGeometry";

// --- Fixtures: faithful TS ports of the Rust fixtures in graph.rs ---

// Port of make_two_area_screen (graph.rs:1101). Two areas split by a vertical
// divider at x=0.5 (edge "e_mid", non-border). v1=bottom-left, v2=top-left,
// v3=top-right, v4=bottom-right.
function makeTwoAreaScreen(): Screen {
  return {
    vertices: [
      { id: "bl", x: 0.0, y: 0.0 },
      { id: "tl", x: 0.0, y: 1.0 },
      { id: "mb", x: 0.5, y: 0.0 },
      { id: "mt", x: 0.5, y: 1.0 },
      { id: "br", x: 1.0, y: 0.0 },
      { id: "tr", x: 1.0, y: 1.0 },
    ],
    edges: [
      { id: "e_left", v1: "bl", v2: "tl", border: true },
      { id: "e_topl", v1: "tl", v2: "mt", border: true },
      { id: "e_topr", v1: "mt", v2: "tr", border: true },
      { id: "e_right", v1: "tr", v2: "br", border: true },
      { id: "e_botr", v1: "br", v2: "mb", border: true },
      { id: "e_botl", v1: "mb", v2: "bl", border: true },
      { id: "e_mid", v1: "mt", v2: "mb", border: false },
    ],
    areas: [
      {
        id: "a_left",
        v1: "bl", v2: "tl", v3: "mt", v4: "mb",
        panel_type: "blank", terminal_id: null,
      },
      {
        id: "a_right",
        v1: "mb", v2: "mt", v3: "tr", v4: "br",
        panel_type: "blank", terminal_id: null,
      },
    ],
  };
}

// Port of make_two_area_screen but split HORIZONTALLY at y=0.5 (edge "e_mid").
// Bottom area / top area. Mirrors what Screen::new() + horizontal area_split
// produces, expressed in the same explicit style as makeTwoAreaScreen.
function makeTwoAreaScreenHorizontal(): Screen {
  return {
    vertices: [
      { id: "bl", x: 0.0, y: 0.0 },
      { id: "br", x: 1.0, y: 0.0 },
      { id: "ml", x: 0.0, y: 0.5 },
      { id: "mr", x: 1.0, y: 0.5 },
      { id: "tl", x: 0.0, y: 1.0 },
      { id: "tr", x: 1.0, y: 1.0 },
    ],
    edges: [
      { id: "e_bot", v1: "bl", v2: "br", border: true },
      { id: "e_rightb", v1: "br", v2: "mr", border: true },
      { id: "e_rightt", v1: "mr", v2: "tr", border: true },
      { id: "e_top", v1: "tr", v2: "tl", border: true },
      { id: "e_leftt", v1: "tl", v2: "ml", border: true },
      { id: "e_leftb", v1: "ml", v2: "bl", border: true },
      { id: "e_mid", v1: "ml", v2: "mr", border: false },
    ],
    areas: [
      {
        // bottom area: bl(bottom-left) ml(top-left) mr(top-right) br(bottom-right)
        id: "a_bottom",
        v1: "bl", v2: "ml", v3: "mr", v4: "br",
        panel_type: "blank", terminal_id: null,
      },
      {
        // top area: ml(bottom-left) tl(top-left) tr(top-right) mr(bottom-right)
        id: "a_top",
        v1: "ml", v2: "tl", v3: "tr", v4: "mr",
        panel_type: "blank", terminal_id: null,
      },
    ],
  };
}

// Port of make_t_junction_screen (graph.rs:1135). A horizontal divider at y=0.5
// (v3-v4-v5) with a perpendicular vertical stub (v1-v4) above it, forming a T.
function makeTJunctionScreen(): Screen {
  return {
    vertices: [
      { id: "v0", x: 0.0, y: 1.0 },
      { id: "v1", x: 0.5, y: 1.0 },
      { id: "v2", x: 1.0, y: 1.0 },
      { id: "v3", x: 0.0, y: 0.5 },
      { id: "v4", x: 0.5, y: 0.5 },
      { id: "v5", x: 1.0, y: 0.5 },
      { id: "v6", x: 0.0, y: 0.0 },
      { id: "v7", x: 1.0, y: 0.0 },
    ],
    edges: [
      { id: "e_topl", v1: "v0", v2: "v1", border: true },
      { id: "e_topr", v1: "v1", v2: "v2", border: true },
      { id: "e_rightt", v1: "v2", v2: "v5", border: true },
      { id: "e_rightb", v1: "v5", v2: "v7", border: true },
      { id: "e_bot", v1: "v7", v2: "v6", border: true },
      { id: "e_leftb", v1: "v6", v2: "v3", border: true },
      { id: "e_leftt", v1: "v3", v2: "v0", border: true },
      { id: "e_vert", v1: "v1", v2: "v4", border: false },
      { id: "e_horizl", v1: "v3", v2: "v4", border: false },
      { id: "e_horizr", v1: "v4", v2: "v5", border: false },
    ],
    areas: [
      {
        id: "a_a",
        v1: "v3", v2: "v0", v3: "v1", v4: "v4",
        panel_type: "blank", terminal_id: null,
      },
      {
        id: "a_b",
        v1: "v4", v2: "v1", v3: "v2", v4: "v5",
        panel_type: "blank", terminal_id: null,
      },
      {
        id: "a_c",
        v1: "v6", v2: "v3", v3: "v5", v4: "v7",
        panel_type: "blank", terminal_id: null,
      },
    ],
  };
}

// --- Helpers mirroring area_bounds (left, bottom, right, top) ---

function areaBounds(
  screen: Screen,
  areaId: string,
): { left: number; bottom: number; right: number; top: number } {
  const a = screen.areas.find((x) => x.id === areaId)!;
  const v1 = screen.vertices.find((v) => v.id === a.v1)!;
  const v3 = screen.vertices.find((v) => v.id === a.v3)!;
  return { left: v1.x, bottom: v1.y, right: v3.x, top: v3.y };
}

function vertexCoord(screen: Screen, id: string): { x: number; y: number } {
  const v = screen.vertices.find((vx) => vx.id === id)!;
  return { x: v.x, y: v.y };
}

// --- resizeEdgeLocal parity tests ---

describe("resizeEdgeLocal — parity with Rust resize_edge", () => {
  // Port of test_resize_edge_vertical (graph.rs:2161): divider 0.5 -> 0.3.
  it("vertical divider 0.5 -> 0.3 reflows both neighbours", () => {
    const out = resizeEdgeLocal(makeTwoAreaScreen(), "e_mid", 0.3);
    const left = areaBounds(out, "a_left");
    const right = areaBounds(out, "a_right");
    expect(left.right - left.left).toBeCloseTo(0.3, 9);
    expect(right.right - right.left).toBeCloseTo(0.7, 9);
  });

  // Port of test_resize_edge_horizontal (graph.rs:2195): divider 0.5 -> 0.7.
  it("horizontal divider 0.5 -> 0.7 reflows both neighbours", () => {
    const out = resizeEdgeLocal(makeTwoAreaScreenHorizontal(), "e_mid", 0.7);
    const bottom = areaBounds(out, "a_bottom");
    const top = areaBounds(out, "a_top");
    expect(bottom.top - bottom.bottom).toBeCloseTo(0.7, 9);
    expect(top.top - top.bottom).toBeCloseTo(0.3, 9);
  });

  // Port of test_resize_edge_clamped (graph.rs:2227): resize to 0.99 clamps to
  // <= 1.0 - MIN_AREA_SIZE = 0.95 (and never below the current position).
  it("clamps to MIN_AREA_SIZE (0.99 -> <= 0.95)", () => {
    const screen = makeTwoAreaScreen();
    const currentX = vertexCoord(screen, "mt").x;
    const out = resizeEdgeLocal(screen, "e_mid", 0.99);
    const newX = vertexCoord(out, "mt").x;
    expect(newX).toBeLessThanOrEqual(1.0 - MIN_AREA_SIZE + EPSILON);
    expect(newX).toBeGreaterThanOrEqual(currentX);
    // It lands exactly on the constraint.
    expect(newX).toBeCloseTo(0.95, 9);
  });

  // Port of test_resize_edge_t_junction (graph.rs:2252): the whole horizontal
  // divider — v3, v4 AND v5 — moves to y=0.3; the perpendicular stub (v1) stays.
  it("T-junction: whole divider (v3,v4,v5) moves, stub (v1) stays", () => {
    const out = resizeEdgeLocal(makeTJunctionScreen(), "e_horizl", 0.3);
    expect(vertexCoord(out, "v3").y).toBeCloseTo(0.3, 9);
    expect(vertexCoord(out, "v4").y).toBeCloseTo(0.3, 9);
    expect(vertexCoord(out, "v5").y).toBeCloseTo(0.3, 9);
    // The vertical stub vertex must NOT have moved.
    expect(vertexCoord(out, "v1").y).toBeCloseTo(1.0, 9);
  });

  // Port of test_resize_edge_nonexistent (graph.rs:2267): bad edge id is an
  // error path (Rust returns Err; we throw).
  it("throws on a nonexistent edge id", () => {
    expect(() => resizeEdgeLocal(makeTwoAreaScreen(), "nonexistent", 0.5)).toThrow();
  });

  // Port of test_resize_edge_clamped_to_screen_boundary (graph.rs:2531): the
  // Infinity / no-area-on-one-side path. 5.0 clamps to <= 1.0; -5.0 clamps to
  // >= 0.0. (Each neighbour bounds only one side, so the other side relies on
  // the final [0,1] clamp.)
  it("clamps to screen boundary [0,1] (5.0 -> <=1, -5.0 -> >=0)", () => {
    const high = resizeEdgeLocal(makeTwoAreaScreen(), "e_mid", 5.0);
    expect(vertexCoord(high, "mt").x).toBeLessThanOrEqual(1.0 + EPSILON);
    expect(vertexCoord(high, "mb").x).toBeLessThanOrEqual(1.0 + EPSILON);

    const low = resizeEdgeLocal(makeTwoAreaScreen(), "e_mid", -5.0);
    expect(vertexCoord(low, "mt").x).toBeGreaterThanOrEqual(-EPSILON);
    expect(vertexCoord(low, "mb").x).toBeGreaterThanOrEqual(-EPSILON);
  });

  // Isolates the Infinity (no-area-on-one-side) path that the two-area fixtures
  // never reach: a single area on the LEFT only. Resizing the right border to
  // 5.0 leaves `bigger = Infinity` (no area to the right constrains it), so the
  // side clamp is a no-op and only the final [0,1] clamp pulls it to 1.0.
  it("Infinity path: no area on one side degrades to the [0,1] clamp", () => {
    const screen: Screen = {
      vertices: [
        { id: "bl", x: 0.0, y: 0.0 },
        { id: "tl", x: 0.0, y: 1.0 },
        { id: "rb", x: 0.5, y: 0.0 },
        { id: "rt", x: 0.5, y: 1.0 },
      ],
      edges: [
        { id: "e_left", v1: "bl", v2: "tl", border: true },
        { id: "e_top", v1: "tl", v2: "rt", border: true },
        { id: "e_right", v1: "rt", v2: "rb", border: false },
        { id: "e_bot", v1: "rb", v2: "bl", border: true },
      ],
      areas: [
        {
          id: "a_only",
          v1: "bl", v2: "tl", v3: "rt", v4: "rb",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };
    // e_right is the area's RIGHT edge (v3 & v4) → constrains `smaller` only;
    // `bigger` stays Infinity. clamp(5.0, 0.5-0.45, +inf) = 5.0 → [0,1] → 1.0.
    const out = resizeEdgeLocal(screen, "e_right", 5.0);
    expect(vertexCoord(out, "rt").x).toBeCloseTo(1.0, 9);
    expect(vertexCoord(out, "rb").x).toBeCloseTo(1.0, 9);
  });

  // Port of test_resize_edge_merges_coincident_vertices (graph.rs:2656). We skip
  // cleanup(), so assert on COORDINATES: the moved divider lands exactly on the
  // pre-existing vertices, producing DUPLICATE-vertex topology (2 per position).
  it("moves vertices onto coincident landing (duplicate topology, no cleanup)", () => {
    const screen = makeTwoAreaScreen();
    // Add an extra vertical edge at x=0.3 whose vertices the divider will land
    // on when e_mid (x=0.5) is resized to 0.3.
    screen.vertices.push({ id: "vx_bot", x: 0.3, y: 0.0 });
    screen.vertices.push({ id: "vx_top", x: 0.3, y: 1.0 });
    screen.edges.push({ id: "e_x", v1: "vx_bot", v2: "vx_top", border: false });

    const out = resizeEdgeLocal(screen, "e_mid", 0.3);

    // The moved divider vertices sit exactly on the coincident coordinate.
    expect(vertexCoord(out, "mt").x).toBeCloseTo(0.3, 9);
    expect(vertexCoord(out, "mb").x).toBeCloseTo(0.3, 9);

    // The pre-existing vertices are untouched (e_x shares no vertex with the
    // selected set, so it never floods in).
    expect(vertexCoord(out, "vx_top").x).toBeCloseTo(0.3, 9);
    expect(vertexCoord(out, "vx_bot").x).toBeCloseTo(0.3, 9);

    // Without cleanup(), duplicate vertices persist at each coincident landing.
    const at = (x: number, y: number) =>
      out.vertices.filter(
        (v) => Math.abs(v.x - x) < EPSILON && Math.abs(v.y - y) < EPSILON,
      ).length;
    expect(at(0.3, 0.0)).toBe(2);
    expect(at(0.3, 1.0)).toBe(2);
  });

  it("does not mutate the input screen", () => {
    const screen = makeTwoAreaScreen();
    resizeEdgeLocal(screen, "e_mid", 0.3);
    expect(vertexCoord(screen, "mt").x).toBeCloseTo(0.5, 9);
    expect(vertexCoord(screen, "mb").x).toBeCloseTo(0.5, 9);
  });
});

// --- selectConnectedVertices unit tests ---

describe("selectConnectedVertices", () => {
  it("two-area divider selects exactly its 2 endpoints", () => {
    const selected = selectConnectedVertices(makeTwoAreaScreen(), "e_mid");
    expect(selected).toEqual(new Set(["mt", "mb"]));
  });

  it("T-junction selects the 3 collinear divider vertices, not the perpendicular stub", () => {
    const selected = selectConnectedVertices(makeTJunctionScreen(), "e_horizl");
    expect(selected).toEqual(new Set(["v3", "v4", "v5"]));
    expect(selected.has("v1")).toBe(false);
  });

  it("returns an empty set for a missing edge", () => {
    expect(selectConnectedVertices(makeTwoAreaScreen(), "nope").size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Point-in-area hit testing
// ---------------------------------------------------------------------------

/** Build a vertex map from a screen. */
function vmap(screen: Screen): Map<string, Vertex> {
  return new Map(screen.vertices.map((v) => [v.id, v]));
}

describe("pointInArea", () => {
  const screen = makeTwoAreaScreen();
  const vm = vmap(screen);
  const leftArea = screen.areas.find((a) => a.id === "a_left")!;

  it("point clearly inside an area returns true", () => {
    expect(pointInArea(0.25, 0.5, leftArea, vm)).toBe(true);
  });

  it("point outside an area returns false", () => {
    expect(pointInArea(0.75, 0.5, leftArea, vm)).toBe(false);
  });

  it("point on a shared boundary returns true (inclusive with EPSILON)", () => {
    // x=0.5 is the shared boundary between left and right areas.
    expect(pointInArea(0.5, 0.5, leftArea, vm)).toBe(true);
  });

  it("area with a missing vertex returns false", () => {
    const orphan: Area = {
      id: "orphan",
      v1: "exists", v2: "exists", v3: "missing", v4: "exists",
      panel_type: "blank", terminal_id: null,
    };
    const partialMap = new Map<string, Vertex>([
      ["exists", { id: "exists", x: 0, y: 0 }],
    ]);
    expect(pointInArea(0.5, 0.5, orphan, partialMap)).toBe(false);
  });
});

describe("findAreaAtPoint", () => {
  const screen = makeTwoAreaScreen();
  const vm = vmap(screen);

  it("point in left half returns left area", () => {
    const found = findAreaAtPoint(screen.areas, 0.25, 0.5, vm);
    expect(found).not.toBeNull();
    expect(found!.id).toBe("a_left");
  });

  it("point in right half returns right area", () => {
    const found = findAreaAtPoint(screen.areas, 0.75, 0.5, vm);
    expect(found).not.toBeNull();
    expect(found!.id).toBe("a_right");
  });

  it("point outside [0,1] returns null", () => {
    expect(findAreaAtPoint(screen.areas, -0.1, 0.5, vm)).toBeNull();
    expect(findAreaAtPoint(screen.areas, 0.5, 1.1, vm)).toBeNull();
  });
});

describe("getAdjacency", () => {
  // ------------------------------------------------------------------
  // Vertical (left/right) split
  // ------------------------------------------------------------------
  it("left/right split: left.east(right) and right.west(left)", () => {
    const screen = makeTwoAreaScreen();
    const vm = vmap(screen);
    const left = screen.areas.find((a) => a.id === "a_left")!;
    const right = screen.areas.find((a) => a.id === "a_right")!;

    expect(getAdjacency(left, right, vm)).toBe("east");
    expect(getAdjacency(right, left, vm)).toBe("west");
  });

  // ------------------------------------------------------------------
  // Horizontal (top/bottom) split
  // ------------------------------------------------------------------
  it("top/bottom split: bottom.north(top) and top.south(bottom)", () => {
    const screen = makeTwoAreaScreenHorizontal();
    const vm = vmap(screen);
    const bottom = screen.areas.find((a) => a.id === "a_bottom")!;
    const top = screen.areas.find((a) => a.id === "a_top")!;

    // B is above A → north (bottom → top = north; top → bottom = south)
    expect(getAdjacency(bottom, top, vm)).toBe("north");
    expect(getAdjacency(top, bottom, vm)).toBe("south");
  });

  // ------------------------------------------------------------------
  // Insufficient overlap
  // ------------------------------------------------------------------
  it("returns null when perpendicular overlap is below MIN_AREA_SIZE", () => {
    // Two areas stacked vertically but each only 0.02 wide — overlap_x < 0.05.
    const screen: Screen = {
      vertices: [
        { id: "bl_a", x: 0.49, y: 0.0 },
        { id: "tl_a", x: 0.49, y: 0.5 },
        { id: "br_a", x: 0.51, y: 0.0 },
        { id: "tr_a", x: 0.51, y: 0.5 },
        { id: "bl_b", x: 0.49, y: 0.5 },
        { id: "tl_b", x: 0.49, y: 1.0 },
        { id: "br_b", x: 0.51, y: 0.5 },
        { id: "tr_b", x: 0.51, y: 1.0 },
      ],
      edges: [],
      areas: [
        {
          id: "a_narrow_bot",
          v1: "bl_a", v2: "tl_a", v3: "tr_a", v4: "br_a",
          panel_type: "blank", terminal_id: null,
        },
        {
          id: "a_narrow_top",
          v1: "bl_b", v2: "tl_b", v3: "tr_b", v4: "br_b",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };
    const vm = vmap(screen);
    const bottom = screen.areas[0];
    const top = screen.areas[1];

    // overlap_x = min(0.51,0.51) - max(0.49,0.49) = 0.02 < 0.05
    expect(getAdjacency(bottom, top, vm)).toBeNull();
    expect(getAdjacency(top, bottom, vm)).toBeNull();
  });

  // ------------------------------------------------------------------
  // Non-adjacent / separated
  // ------------------------------------------------------------------
  it("returns null for non-adjacent (diagonal/separated) areas", () => {
    // Two areas in opposite quadrants touching at a single point (corner).
    const screen: Screen = {
      vertices: [
        { id: "bl1", x: 0.0, y: 0.0 },
        { id: "tl1", x: 0.0, y: 0.4 },
        { id: "tr1", x: 0.4, y: 0.4 },
        { id: "br1", x: 0.4, y: 0.0 },
        { id: "bl2", x: 0.6, y: 0.6 },
        { id: "tl2", x: 0.6, y: 1.0 },
        { id: "tr2", x: 1.0, y: 1.0 },
        { id: "br2", x: 1.0, y: 0.6 },
      ],
      edges: [],
      areas: [
        {
          id: "a_botleft",
          v1: "bl1", v2: "tl1", v3: "tr1", v4: "br1",
          panel_type: "blank", terminal_id: null,
        },
        {
          id: "a_topright",
          v1: "bl2", v2: "tl2", v3: "tr2", v4: "br2",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };
    const vm = vmap(screen);
    expect(getAdjacency(screen.areas[0], screen.areas[1], vm)).toBeNull();
    expect(getAdjacency(screen.areas[1], screen.areas[0], vm)).toBeNull();
  });

  // ------------------------------------------------------------------
  // T-junction
  // ------------------------------------------------------------------
  it("T-junction: each adjacent pair resolves correctly", () => {
    const screen = makeTJunctionScreen();
    const vm = vmap(screen);

    const a_a = screen.areas.find((a) => a.id === "a_a")!;
    const a_b = screen.areas.find((a) => a.id === "a_b")!;
    const a_c = screen.areas.find((a) => a.id === "a_c")!;

    // a_a [0,0.5]×[0.5,1]  a_b [0.5,1]×[0.5,1]
    // a_c [0,1]×[0,0.5]
    //
    // a_a east of a_c, a_b east of a_c, a_a east of a_b

    // a_c → a_a (north: a_a is above a_c)
    expect(getAdjacency(a_c, a_a, vm)).toBe("north");
    // a_a → a_c (south: a_c is below a_a)
    expect(getAdjacency(a_a, a_c, vm)).toBe("south");

    // a_c → a_b (north: a_b is above a_c)
    expect(getAdjacency(a_c, a_b, vm)).toBe("north");
    // a_b → a_c (south: a_c is below a_b)
    expect(getAdjacency(a_b, a_c, vm)).toBe("south");

    // a_a → a_b (east: a_b is east of a_a)
    expect(getAdjacency(a_a, a_b, vm)).toBe("east");
    // a_b → a_a (west: a_a is west of a_b)
    expect(getAdjacency(a_b, a_a, vm)).toBe("west");
  });
});

describe("classifyCornerDrag", () => {
  it("cursor in grabbed area returns split", () => {
    const screen = makeTwoAreaScreen();
    const vm = vmap(screen);
    const leftArea = screen.areas.find((a) => a.id === "a_left")!;
    const result = classifyCornerDrag(leftArea, 0.25, 0.5, screen.areas, vm);
    expect(result.mode).toBe("split");
    expect(result.targetAreaId).toBeNull();
    expect(result.direction).toBeNull();
  });

  it("cursor in adjacent neighbour (right) returns join with east direction", () => {
    const screen = makeTwoAreaScreen();
    const vm = vmap(screen);
    const leftArea = screen.areas.find((a) => a.id === "a_left")!;
    const rightArea = screen.areas.find((a) => a.id === "a_right")!;
    const result = classifyCornerDrag(leftArea, 0.75, 0.5, screen.areas, vm);
    expect(result.mode).toBe("join");
    expect(result.targetAreaId).toBe(rightArea.id);
    expect(result.direction).toBe("east");
  });

  it("cursor in adjacent neighbour (left) returns join with west direction", () => {
    const screen = makeTwoAreaScreen();
    const vm = vmap(screen);
    const rightArea = screen.areas.find((a) => a.id === "a_right")!;
    const leftArea = screen.areas.find((a) => a.id === "a_left")!;
    const result = classifyCornerDrag(rightArea, 0.25, 0.5, screen.areas, vm);
    expect(result.mode).toBe("join");
    expect(result.targetAreaId).toBe(leftArea.id);
    expect(result.direction).toBe("west");
  });

  it("cursor in adjacent neighbour (top) returns join with north direction", () => {
    const screen = makeTwoAreaScreenHorizontal();
    const vm = vmap(screen);
    const bottomArea = screen.areas.find((a) => a.id === "a_bottom")!;
    const topArea = screen.areas.find((a) => a.id === "a_top")!;
    const result = classifyCornerDrag(bottomArea, 0.5, 0.75, screen.areas, vm);
    expect(result.mode).toBe("join");
    expect(result.targetAreaId).toBe(topArea.id);
    expect(result.direction).toBe("north");
  });

  it("cursor in adjacent neighbour (bottom) returns join with south direction", () => {
    const screen = makeTwoAreaScreenHorizontal();
    const vm = vmap(screen);
    const topArea = screen.areas.find((a) => a.id === "a_top")!;
    const bottomArea = screen.areas.find((a) => a.id === "a_bottom")!;
    const result = classifyCornerDrag(topArea, 0.5, 0.25, screen.areas, vm);
    expect(result.mode).toBe("join");
    expect(result.targetAreaId).toBe(bottomArea.id);
    expect(result.direction).toBe("south");
  });

  it("cursor in a non-adjacent area returns invalid", () => {
    const screen: Screen = {
      vertices: [
        { id: "bl1", x: 0.0, y: 0.0 },
        { id: "tl1", x: 0.0, y: 0.4 },
        { id: "tr1", x: 0.4, y: 0.4 },
        { id: "br1", x: 0.4, y: 0.0 },
        { id: "bl2", x: 0.6, y: 0.6 },
        { id: "tl2", x: 0.6, y: 1.0 },
        { id: "tr2", x: 1.0, y: 1.0 },
        { id: "br2", x: 1.0, y: 0.6 },
      ],
      edges: [],
      areas: [
        { id: "a_botleft", v1: "bl1", v2: "tl1", v3: "tr1", v4: "br1", panel_type: "blank", terminal_id: null },
        { id: "a_topright", v1: "bl2", v2: "tl2", v3: "tr2", v4: "br2", panel_type: "blank", terminal_id: null },
      ],
    };
    const vm = vmap(screen);
    const botleft = screen.areas.find((a) => a.id === "a_botleft")!;
    // Cursor in topright (diagonal, not adjacent)
    const result = classifyCornerDrag(botleft, 0.8, 0.8, screen.areas, vm);
    expect(result.mode).toBe("invalid");
    expect(result.targetAreaId).toBeNull();
    expect(result.direction).toBeNull();
  });

  it("cursor outside all areas returns invalid", () => {
    const screen = makeTwoAreaScreen();
    const vm = vmap(screen);
    const leftArea = screen.areas.find((a) => a.id === "a_left")!;
    const result = classifyCornerDrag(leftArea, -0.1, 0.5, screen.areas, vm);
    expect(result.mode).toBe("invalid");
    expect(result.targetAreaId).toBeNull();
    expect(result.direction).toBeNull();
  });
});
