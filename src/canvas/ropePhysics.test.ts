import { describe, it, expect } from "vitest";
import { createRope, stepRope, DEFAULT_ROPE_CONFIG } from "./ropePhysics";

describe("createRope", () => {
  it("creates correct number of points", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 }, { points: 18 });
    expect(r).toHaveLength(18);
  });

  it("first point at source, last near target", () => {
    const r = createRope({ x: 10, y: 20 }, { x: 100, y: 200 });
    expect(r[0].x).toBe(10);
    expect(r[0].y).toBe(20);
    const last = r[r.length - 1];
    expect(Math.abs(last.x - 100)).toBeLessThan(50);
    expect(Math.abs(last.y - 200)).toBeLessThan(50);
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

  it("damping reduces velocity", () => {
    const r = createRope({ x: 0, y: 0 }, { x: 100, y: 0 });
    stepRope(r, { x: 0, y: 0 }, { x: 200, y: 0 }, 0.016);
    const positions1 = r.map((p) => ({ x: p.x, y: p.y }));
    stepRope(r, { x: 0, y: 0 }, { x: 200, y: 0 }, 0.016);
    const positions2 = r.map((p) => ({ x: p.x, y: p.y }));
    expect(Math.abs(positions2[1].x - positions1[1].x)).toBeLessThan(10);
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
});
