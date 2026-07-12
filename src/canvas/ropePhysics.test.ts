import { describe, it, expect } from "vitest";
import { createRope, stepRope, DEFAULT_ROPE_CONFIG } from "./ropePhysics";

const SIDE = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } } as const;

describe("createRope", () => {
  it("creates correct number of points", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, { points: 18 });
    expect(r).toHaveLength(18);
  });

  it("first point at source, last at target", () => {
    const r = createRope({ x: 10, y: 20 }, { x: 100, y: 200 });
    expect(r[0].x).toBe(10);
    expect(r[0].y).toBe(20);
    const last = r[r.length - 1];
    expect(last.x).toBe(100);
    expect(last.y).toBe(200);
  });

  it("uses default config when none provided", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(r).toHaveLength(DEFAULT_ROPE_CONFIG.points);
  });
});

describe("stepRope", () => {
  it("applies gravity (points fall)", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 });
    const before = r.map((p) => p.y);
    stepRope(r, { x: 0, y: 0 }, { x: 100, y: 0 }, 0.016);
    const after = r.map((p) => p.y);
    expect(after.some((y, i) => y > before[i])).toBe(true);
  });

  it("last point stays anchored at target", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 });
    for (let i = 0; i < 10; i++) {
      stepRope(r, { x: 0, y: 0 }, { x: 200, y: 100 }, 0.016);
    }
    expect(r[r.length - 1].x).toBe(200);
    expect(r[r.length - 1].y).toBe(100);
  });

  it("first point stays anchored at source", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 });
    for (let i = 0; i < 10; i++) {
      stepRope(r, { x: 0, y: 0 }, { x: 200, y: 100 }, 0.016);
    }
    expect(r[0].x).toBe(0);
    expect(r[0].y).toBe(0);
  });

  it("does not mutate config", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 });
    const p = { ...DEFAULT_ROPE_CONFIG };
    stepRope(r, { x: 0, y: 0 }, { x: 100, y: 0 }, 0.016, { damping: 0.9 });
    expect(DEFAULT_ROPE_CONFIG.damping).toBe(p.damping);
  });

  it("pins launch anchors when sourceDir/targetDir provided", () => {
    const r = createRope({ x: 100, y: 100 }, { x: 300, y: 100 });
    stepRope(r, { x: 100, y: 100 }, { x: 300, y: 100 }, 0.016, {
      sourceDir: SIDE.right,
      targetDir: SIDE.left,
    });
    // Point 0 is at source (100, 100)
    expect(r[0].x).toBe(100);
    expect(r[0].y).toBe(100);
    // Point 1 is at launch position: source + sourceDir * launch (30px right)
    expect(r[1].x).toBe(130);
    expect(r[1].y).toBe(100);
    // Point n-2 is at target + targetDir * launch (30px left from target)
    expect(r[r.length - 2].x).toBe(270);
    expect(r[r.length - 2].y).toBe(100);
    // Last point at target
    expect(r[r.length - 1].x).toBe(300);
    expect(r[r.length - 1].y).toBe(100);
  });
});
