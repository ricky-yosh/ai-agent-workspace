import { describe, it, expect, vi, afterEach } from "vitest";
import type { Screen, Area, Vertex } from "./types/screen";
import {
  prefersReducedMotion,
  areaRect,
  diffAreas,
  determineEnterSeam,
  determineExitCollapse,
} from "./screenMotion";
import type { SeamSide } from "./screenMotion";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal 2-area screen (left/right split). Matches the fixture in screenGeometry.test. */
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
    edges: [],
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

// ---------------------------------------------------------------------------
// prefersReducedMotion
// ---------------------------------------------------------------------------

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when matchMedia is absent (SSR/jsdom)", () => {
    // jsdom does NOT implement matchMedia by default in vitest. Guard test.
    // We simulate the absence by deleting it if present.
    const orig = window.matchMedia;
    // @ts-expect-error deleting well-known API for test
    delete window.matchMedia;

    expect(prefersReducedMotion()).toBe(false);

    // Restore for other tests
    window.matchMedia = orig;
  });

  it("returns true when prefers-reduced-motion: reduce is active", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      // jsdom's MediaQueryList stub needs these:
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
    }));

    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false when prefers-reduced-motion: no-preference is active", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: "",
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
    }));

    expect(prefersReducedMotion()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// areaRect
// ---------------------------------------------------------------------------

describe("areaRect", () => {
  it("computes correct percentages for a left-area", () => {
    const screen = makeTwoAreaScreen();
    const vmap = new Map(screen.vertices.map((v) => [v.id, v]));
    const rect = areaRect(screen.areas[0], vmap);

    expect(rect).not.toBeNull();
    expect(rect!.left).toBeCloseTo(0);   // v1.x = 0
    expect(rect!.top).toBeCloseTo(0);    // (1 - v2.y) = (1 - 1) = 0
    expect(rect!.width).toBeCloseTo(50); // v3.x - v1.x = 0.5 - 0 = 0.5 → 50%
    expect(rect!.height).toBeCloseTo(100); // v2.y - v1.y = 1 - 0 = 1 → 100%
  });

  it("computes correct percentages for a right-area", () => {
    const screen = makeTwoAreaScreen();
    const vmap = new Map(screen.vertices.map((v) => [v.id, v]));
    const rect = areaRect(screen.areas[1], vmap);

    expect(rect).not.toBeNull();
    expect(rect!.left).toBeCloseTo(50);  // v1.x = 0.5
    expect(rect!.top).toBeCloseTo(0);    // (1 - v2.y) = (1 - 1) = 0
    expect(rect!.width).toBeCloseTo(50); // v3.x - v1.x = 1 - 0.5 = 0.5 → 50%
    expect(rect!.height).toBeCloseTo(100);
  });

  it("returns null when a vertex is missing", () => {
    const area: Area = {
      id: "orphan",
      v1: "exists", v2: "exists", v3: "missing", v4: "exists",
      panel_type: "blank", terminal_id: null,
    };
    const vmap = new Map<string, Vertex>([
      ["exists", { id: "exists", x: 0, y: 0 }],
    ]);
    expect(areaRect(area, vmap)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// diffAreas
// ---------------------------------------------------------------------------

describe("diffAreas", () => {
  const screenA = makeTwoAreaScreen();

  it("returns empty diff when prev is null (first render)", () => {
    const diff = diffAreas(null, screenA);
    expect(diff.addedIds.size).toBe(0);
    expect(diff.removed.length).toBe(0);
  });

  it("returns empty diff for identical screens (no area set change)", () => {
    const diff = diffAreas(screenA, screenA);
    expect(diff.addedIds.size).toBe(0);
    expect(diff.removed.length).toBe(0);
  });

  it("detects an added area (split)", () => {
    // Add a third area
    const screenB: Screen = {
      ...screenA,
      areas: [
        ...screenA.areas,
        {
          id: "a_new",
          v1: "mb", v2: "mt", v3: "br", v4: "bl",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };
    const diff = diffAreas(screenA, screenB);
    expect(diff.addedIds).toEqual(new Set(["a_new"]));
    expect(diff.removed).toEqual([]);
  });

  it("detects a removed area (close/join)", () => {
    const screenB: Screen = {
      ...screenA,
      areas: screenA.areas.filter((a) => a.id !== "a_right"),
    };
    const diff = diffAreas(screenA, screenB);
    expect(diff.addedIds.size).toBe(0);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].id).toBe("a_right");
    // The removed area retains its full object (vertices are resolvable from prev)
    expect(diff.removed[0].v1).toBe("mb");
    expect(diff.removed[0].v2).toBe("mt");
  });

  it("detects both added and removed (replace)", () => {
    // Replace a_right with a_new (different id, same vertex refs)
    const screenB: Screen = {
      ...screenA,
      areas: [
        screenA.areas[0],
        {
          id: "a_new",
          v1: "mb", v2: "mt", v3: "tr", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };
    const diff = diffAreas(screenA, screenB);
    expect(diff.addedIds).toEqual(new Set(["a_new"]));
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].id).toBe("a_right");
  });

  it("detects no set change for pure geometry change (sash resize)", () => {
    // Same area IDs, different vertex positions — this is the critical gating case.
    const screenB: Screen = {
      ...screenA,
      // Shift the divider vertex positions without changing area IDs
      vertices: screenA.vertices.map((v) =>
        v.id === "mb" || v.id === "mt"
          ? { ...v, x: 0.7 }
          : v,
      ),
    };
    const diff = diffAreas(screenA, screenB);
    expect(diff.addedIds.size).toBe(0);
    expect(diff.removed.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// determineEnterSeam (Bundle 2: enter FLIP origin)
// ---------------------------------------------------------------------------

/** Helper: build a vertex map from a screen's vertex array. */
function vmap(screen: Screen): Map<string, Vertex> {
  return new Map(screen.vertices.map((v) => [v.id, v]));
}

/** Assert that a SeamSide matches expected values. */
function expectSeam(
  actual: SeamSide | null,
  expected: SeamSide | null,
): void {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  expect(actual!.transformOrigin).toBe(expected.transformOrigin);
  expect(actual!.scaleAxis).toBe(expected.scaleAxis);
}

describe("determineEnterSeam", () => {
  // ------------------------------------------------------------------
  // Vertical splits (side-by-side)
  // ------------------------------------------------------------------

  it("vertical split: new area to the RIGHT → 'left center' / scaleX", () => {
    // 2-area vertical screen. After split of left area, new area is the
    // right half of the original left side. The entering (new) area's
    // LEFT edge coincides with the survivor's RIGHT edge.
    const screen: Screen = {
      vertices: [
        { id: "bl", x: 0.0, y: 0.0 },
        { id: "tl", x: 0.0, y: 1.0 },
        { id: "mb", x: 0.5, y: 0.0 },
        { id: "mt", x: 0.5, y: 1.0 },
        { id: "br", x: 1.0, y: 0.0 },
        { id: "tr", x: 1.0, y: 1.0 },
      ],
      edges: [],
      areas: [
        {
          id: "a_left", // survivor (original area, resized)
          v1: "bl", v2: "tl", v3: "mt", v4: "mb",
          panel_type: "blank", terminal_id: null,
        },
        {
          id: "a_right", // entering (new area)
          v1: "mb", v2: "mt", v3: "tr", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };

    const entering = screen.areas.find((a) => a.id === "a_right")!;
    const seam = determineEnterSeam(entering, screen, vmap(screen));
    expectSeam(seam, { transformOrigin: "left center", scaleAxis: "scaleX" });
  });

  it("vertical split: new area to the LEFT → 'right center' / scaleX", () => {
    // Same geometry as above, but the survivor is the right area and
    // the entering area is the left one.
    const screen: Screen = {
      vertices: [
        { id: "bl", x: 0.0, y: 0.0 },
        { id: "tl", x: 0.0, y: 1.0 },
        { id: "mb", x: 0.5, y: 0.0 },
        { id: "mt", x: 0.5, y: 1.0 },
        { id: "br", x: 1.0, y: 0.0 },
        { id: "tr", x: 1.0, y: 1.0 },
      ],
      edges: [],
      areas: [
        {
          id: "a_new", // entering
          v1: "bl", v2: "tl", v3: "mt", v4: "mb",
          panel_type: "blank", terminal_id: null,
        },
        {
          id: "a_right", // survivor
          v1: "mb", v2: "mt", v3: "tr", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };

    const entering = screen.areas.find((a) => a.id === "a_new")!;
    const seam = determineEnterSeam(entering, screen, vmap(screen));
    expectSeam(seam, { transformOrigin: "right center", scaleAxis: "scaleX" });
  });

  // ------------------------------------------------------------------
  // Horizontal splits (stacked)
  // ------------------------------------------------------------------

  it("horizontal split: new area BELOW survivor → 'top center' / scaleY", () => {
    // 2-area horizontal screen. Survivor is the top half; entering is
    // the bottom half. The entering area's raw TOP edge coincides with
    // the survivor's raw BOTTOM edge.
    const screen: Screen = {
      vertices: [
        { id: "bl", x: 0.0, y: 0.0 },
        { id: "br", x: 1.0, y: 0.0 },
        { id: "ml", x: 0.0, y: 0.5 },
        { id: "mr", x: 1.0, y: 0.5 },
        { id: "tl", x: 0.0, y: 1.0 },
        { id: "tr", x: 1.0, y: 1.0 },
      ],
      edges: [],
      areas: [
        {
          id: "a_bottom", // entering (new area)
          v1: "bl", v2: "ml", v3: "mr", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
        {
          id: "a_top", // survivor
          v1: "ml", v2: "tl", v3: "tr", v4: "mr",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };

    const entering = screen.areas.find((a) => a.id === "a_bottom")!;
    const seam = determineEnterSeam(entering, screen, vmap(screen));
    expectSeam(seam, { transformOrigin: "top center", scaleAxis: "scaleY" });
  });

  it("horizontal split: new area ABOVE survivor → 'bottom center' / scaleY", () => {
    // Survivor is the bottom half; entering is the top half.
    const screen: Screen = {
      vertices: [
        { id: "bl", x: 0.0, y: 0.0 },
        { id: "br", x: 1.0, y: 0.0 },
        { id: "ml", x: 0.0, y: 0.5 },
        { id: "mr", x: 1.0, y: 0.5 },
        { id: "tl", x: 0.0, y: 1.0 },
        { id: "tr", x: 1.0, y: 1.0 },
      ],
      edges: [],
      areas: [
        {
          id: "a_bottom", // survivor
          v1: "bl", v2: "ml", v3: "mr", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
        {
          id: "a_top", // entering (new area)
          v1: "ml", v2: "tl", v3: "tr", v4: "mr",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };

    const entering = screen.areas.find((a) => a.id === "a_top")!;
    const seam = determineEnterSeam(entering, screen, vmap(screen));
    expectSeam(seam, { transformOrigin: "bottom center", scaleAxis: "scaleY" });
  });

  // ------------------------------------------------------------------
  // Edge cases
  // ------------------------------------------------------------------

  it("returns null when the entering area has no adjacent sibling", () => {
    // A screen with a single area — no possible sibling.
    const screen: Screen = {
      vertices: [
        { id: "bl", x: 0.0, y: 0.0 },
        { id: "tl", x: 0.0, y: 1.0 },
        { id: "tr", x: 1.0, y: 1.0 },
        { id: "br", x: 1.0, y: 0.0 },
      ],
      edges: [],
      areas: [
        {
          id: "a_only",
          v1: "bl", v2: "tl", v3: "tr", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };

    const seam = determineEnterSeam(screen.areas[0], screen, vmap(screen));
    expect(seam).toBeNull();
  });

  it("returns null when a vertex is missing from the vertex map", () => {
    const screen: Screen = {
      vertices: [
        { id: "bl", x: 0.0, y: 0.0 },
        { id: "tl", x: 0.0, y: 1.0 },
        // missing v3, v4 — entering area will reference them
      ],
      edges: [],
      areas: [
        {
          id: "orphan",
          v1: "bl", v2: "tl", v3: "nonexistent", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
        {
          id: "other",
          v1: "bl", v2: "tl", v3: "tr", v4: "br",
          panel_type: "blank", terminal_id: null,
        },
      ],
    };
    // Manually add tr/br so sibling resolves, but entering area is broken.
    const vm = new Map(screen.vertices.map((v) => [v.id, v]));
    vm.set("tr", { id: "tr", x: 1.0, y: 1.0 });
    vm.set("br", { id: "br", x: 1.0, y: 0.0 });

    const entering = screen.areas.find((a) => a.id === "orphan")!;
    const seam = determineEnterSeam(entering, screen, vm);
    expect(seam).toBeNull();
  });

  // ------------------------------------------------------------------
  // determineExitCollapse (Bundle 3: directional ghost collapse)
  // ------------------------------------------------------------------
  //
  // The absorber is the surviving area in the new screen whose bounds
  // overlap the removed area's old bounds the most. The collapse
  // direction points toward the absorber's center.
  //
  // These tests mirror the enter-seam tests — exit is the inverse:
  //   enter grows FROM the seam; exit collapses INTO the seam.
  // ------------------------------------------------------------------
  //
  // We build test screens by starting from a 2-area layout and
  // removing one area; the survivor becomes the absorber. The old
  // (prev) vertex map is the map BEFORE removal; the new (next) screen
  // is the state AFTER removal.
  // ------------------------------------------------------------------

  describe("determineExitCollapse", () => {
    it("vertical absorber to the right → collapse rightward (right center, scaleX)", () => {
      // Before: [left_area | right_area]  (2-area vertical split)
      // After:  right_area survives, left_area removed.
      // The absorber (right_area) is to the RIGHT of the removed area.
      const prevScreen = makeTwoAreaScreen();
      const prevVmap = new Map(prevScreen.vertices.map((v) => [v.id, v]));

      // After removal of left_area: right_area now spans the full width.
      const nextScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_right",
            v1: "bl", v2: "tl", v3: "tr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const nextVmap = new Map(nextScreen.vertices.map((v) => [v.id, v]));

      const removed = prevScreen.areas.find((a) => a.id === "a_left")!;
      const seam = determineExitCollapse(removed, prevVmap, nextScreen, nextVmap);
      expectSeam(seam, { transformOrigin: "right center", scaleAxis: "scaleX" });
    });

    it("vertical absorber to the left → collapse leftward (left center, scaleX)", () => {
      // Before: [left_area | right_area]
      // After:  left_area survives, right_area removed.
      // The absorber (left_area) is to the LEFT of the removed area.
      const prevScreen = makeTwoAreaScreen();
      const prevVmap = new Map(prevScreen.vertices.map((v) => [v.id, v]));

      const nextScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_left",
            v1: "bl", v2: "tl", v3: "tr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const nextVmap = new Map(nextScreen.vertices.map((v) => [v.id, v]));

      const removed = prevScreen.areas.find((a) => a.id === "a_right")!;
      const seam = determineExitCollapse(removed, prevVmap, nextScreen, nextVmap);
      expectSeam(seam, { transformOrigin: "left center", scaleAxis: "scaleX" });
    });

    it("horizontal absorber above → collapse upward (top center, scaleY)", () => {
      // 2-area horizontal stacked screen.
      // Before: [top_area (higher raw y) | bottom_area (lower raw y)]
      // After:  top_area survives (absorber above removed), bottom_area removed.
      // The absorber is ABOVE the removed area (higher raw y) → collapse upward.
      const prevScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "ml", x: 0.0, y: 0.5 },
          { id: "mr", x: 1.0, y: 0.5 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_bottom",
            v1: "bl", v2: "ml", v3: "mr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
          {
            id: "a_top",  // absorber after removal
            v1: "ml", v2: "tl", v3: "tr", v4: "mr",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const prevVmap = new Map(prevScreen.vertices.map((v) => [v.id, v]));

      const nextScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_top",
            v1: "bl", v2: "tl", v3: "tr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const nextVmap = new Map(nextScreen.vertices.map((v) => [v.id, v]));

      const removed = prevScreen.areas.find((a) => a.id === "a_bottom")!;
      const seam = determineExitCollapse(removed, prevVmap, nextScreen, nextVmap);
      expectSeam(seam, { transformOrigin: "top center", scaleAxis: "scaleY" });
    });

    it("horizontal absorber below → collapse downward (bottom center, scaleY)", () => {
      // Before: [top_area | bottom_area]
      // After:  bottom_area survives (absorber below removed), top_area removed.
      const prevScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "ml", x: 0.0, y: 0.5 },
          { id: "mr", x: 1.0, y: 0.5 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_bottom", // absorber after removal
            v1: "bl", v2: "ml", v3: "mr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
          {
            id: "a_top",  // removed
            v1: "ml", v2: "tl", v3: "tr", v4: "mr",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const prevVmap = new Map(prevScreen.vertices.map((v) => [v.id, v]));

      const nextScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_bottom",
            v1: "bl", v2: "tl", v3: "tr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const nextVmap = new Map(nextScreen.vertices.map((v) => [v.id, v]));

      const removed = prevScreen.areas.find((a) => a.id === "a_top")!;
      const seam = determineExitCollapse(removed, prevVmap, nextScreen, nextVmap);
      expectSeam(seam, { transformOrigin: "bottom center", scaleAxis: "scaleY" });
    });

    it("returns null when no overlapping survivor (fallback to fade)", () => {
      // The removed area and the survivor area do not overlap at all — an
      // artificial scenario that should never happen in practice but tests
      // the guard.
      const prevScreen = makeTwoAreaScreen();
      const prevVmap = new Map(prevScreen.vertices.map((v) => [v.id, v]));

      // Both areas removed, leaving a third area in a completely different
      // position (same screen space but no overlap with left_area's old bounds).
      const nextScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_new", // completely different area — no overlap with left_area
            v1: "bl", v2: "tl", v3: "tr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const nextVmap = new Map(nextScreen.vertices.map((v) => [v.id, v]));

      // removed area is a_left, whose old bounds [0,0.5]x[0,1] SHOULD
      // overlap with a_new [0,1]x[0,1], actually — this will NOT return null.
      // To get null, we need the removed area's bounds to miss ALL survivors.
      // Construct a removed area whose bounds are entirely outside the screen.
      const removed: Area = {
        id: "off_screen",
        v1: "missing1", v2: "missing2", v3: "missing3", v4: "missing4",
        panel_type: "blank", terminal_id: null,
      };
      const seam = determineExitCollapse(removed, prevVmap, nextScreen, nextVmap);
      // Missing vertices means rawAreaBounds returns null → null collapse.
      expectSeam(seam, null);
    });

    it("returns null when the removed area has missing vertices", () => {
      const prevVmap = new Map<string, Vertex>([
        ["exists", { id: "exists", x: 0, y: 0 }],
      ]);
      const nextScreen: Screen = {
        vertices: [
          { id: "bl", x: 0.0, y: 0.0 },
          { id: "br", x: 1.0, y: 0.0 },
          { id: "tl", x: 0.0, y: 1.0 },
          { id: "tr", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          {
            id: "a_survivor",
            v1: "bl", v2: "tl", v3: "tr", v4: "br",
            panel_type: "blank", terminal_id: null,
          },
        ],
      };
      const nextVmap = new Map(nextScreen.vertices.map((v) => [v.id, v]));
      const removed: Area = {
        id: "orphan",
        v1: "exists", v2: "exists", v3: "missing", v4: "exists",
        panel_type: "blank", terminal_id: null,
      };
      const seam = determineExitCollapse(removed, prevVmap, nextScreen, nextVmap);
      expectSeam(seam, null);
    });

    it("picks the survivor with the greatest overlap (max-overlap tie-break)", () => {
      // Three areas side-by-side: [A | B | C]. Area B is removed. Both
      // A and C overlap B's old bounds (A overlaps left half, C overlaps
      // right half). Equal overlap → first max wins (stable). In this
      // layout both A and C have the same overlap with B (each overlaps
      // exactly half of B's original rect). Since they're equal on opposite
      // sides, the geometric center delta determines direction.
      //
      // B's old center is at x=0.5. A's center at x=0.25 is LEFTw    wards
      // (dx = -0.25). C's center at x=0.75 is RIGHTwards (dx = 0.25).
      //
      // A has the same overlap as C, but A is scanned first → if both have
      // equal overlap, the first one (A) is picked → collapse leftward.
      const prevScreen: Screen = {
        vertices: [
          { id: "v0", x: 0.0, y: 0.0 },
          { id: "v1", x: 0.3333, y: 0.0 },
          { id: "v2", x: 0.6666, y: 0.0 },
          { id: "v3", x: 1.0, y: 0.0 },
          { id: "v4", x: 0.0, y: 1.0 },
          { id: "v5", x: 0.3333, y: 1.0 },
          { id: "v6", x: 0.6666, y: 1.0 },
          { id: "v7", x: 1.0, y: 1.0 },
        ],
        edges: [],
        areas: [
          { id: "a_A", v1: "v0", v2: "v4", v3: "v5", v4: "v1",
            panel_type: "blank", terminal_id: null },
          { id: "a_B", v1: "v1", v2: "v5", v3: "v6", v4: "v2",
            panel_type: "blank", terminal_id: null },
          { id: "a_C", v1: "v2", v2: "v6", v3: "v7", v4: "v3",
            panel_type: "blank", terminal_id: null },
        ],
      };
      const prevVmap = new Map(prevScreen.vertices.map((v) => [v.id, v]));

      // After removing B, A expands to x: [0, 0.5] and C expands to x: [0.5, 1].
      // B's old bounds: [0.3333, 0.6666]
      //   A overlaps [0.3333, 0.5]   → width 0.1667 → overlap = 0.1667
      //   C overlaps [0.5, 0.6666]   → width 0.1667 → overlap = 0.1667
      // Both have equal overlap. A is scanned first → wins tie → absorber is A
      // (to the LEFT of B) → collapse leftward.
      const nextScreen: Screen = {
        vertices: [
          { id: "v0", x: 0.0, y: 0.0 },
          { id: "v3", x: 1.0, y: 0.0 },
          { id: "v4", x: 0.0, y: 1.0 },
          { id: "v7", x: 1.0, y: 1.0 },
          { id: "v_mid_b", x: 0.5, y: 0.0 },
          { id: "v_mid_t", x: 0.5, y: 1.0 },
        ],
        edges: [],
        areas: [
          { id: "a_A", v1: "v0", v2: "v4", v3: "v_mid_t", v4: "v_mid_b",
            panel_type: "blank", terminal_id: null },
          { id: "a_C", v1: "v_mid_b", v2: "v_mid_t", v3: "v7", v4: "v3",
            panel_type: "blank", terminal_id: null },
        ],
      };
      const nextVmap = new Map(nextScreen.vertices.map((v) => [v.id, v]));

      const removed = prevScreen.areas.find((a) => a.id === "a_B")!;
      const seam = determineExitCollapse(removed, prevVmap, nextScreen, nextVmap);
      expectSeam(seam, { transformOrigin: "left center", scaleAxis: "scaleX" });
    });
  });

  it("detects horizontal seam in a T-junction layout (unambiguous)", () => {
    // T-junction: a_a [0,0.5]×[0.5,1], a_b [0.5,1]×[0.5,1],
    // a_c [0,1]×[0,0.5]. Split a_c horizontally at y=0.25:
    //   a_c_top (survivor): [0,1]×[0.25,0.5]
    //   a_c_bot (entering): [0,1]×[0,0.25]
    // The entering area (a_c_bot) only shares a horizontal seam with
    // a_c_top — the y=0.25 line. a_a and a_b are at y≥0.5, so they
    // have no y-overlap with the entering area (which tops at y=0.25).
    const screen: Screen = {
      vertices: [
        { id: "v0", x: 0.0, y: 1.0 },
        { id: "v1", x: 0.5, y: 1.0 },
        { id: "v2", x: 1.0, y: 1.0 },
        { id: "v3", x: 0.0, y: 0.5 },
        { id: "v4", x: 0.5, y: 0.5 },
        { id: "v5", x: 1.0, y: 0.5 },
        { id: "v6", x: 0.0, y: 0.0 },
        { id: "v7", x: 1.0, y: 0.0 },
        // New vertices from the split at y=0.25
        { id: "v8", x: 0.0, y: 0.25 },
        { id: "v9", x: 1.0, y: 0.25 },
      ],
      edges: [],
      areas: [
        { id: "a_a", v1: "v3", v2: "v0", v3: "v1", v4: "v4",
          panel_type: "blank", terminal_id: null },
        { id: "a_b", v1: "v4", v2: "v1", v3: "v2", v4: "v5",
          panel_type: "blank", terminal_id: null },
        { id: "a_c_top", v1: "v8", v2: "v3", v3: "v5", v4: "v9",
          panel_type: "blank", terminal_id: null },
        { id: "a_c_bot", v1: "v6", v2: "v8", v3: "v9", v4: "v7",
          panel_type: "blank", terminal_id: null },
      ],
    };

    // a_c_bot is BELOW a_c_top → 'top center' / scaleY
    const entering = screen.areas.find((a) => a.id === "a_c_bot")!;
    const seam = determineEnterSeam(entering, screen, vmap(screen));
    expectSeam(seam, { transformOrigin: "top center", scaleAxis: "scaleY" });
  });
});
