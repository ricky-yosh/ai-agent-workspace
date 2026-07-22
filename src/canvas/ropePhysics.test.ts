import { describe, it, expect } from "vitest";
import { computeDragRope } from "./ropePhysics";

const SIDE = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } } as const;

describe("computeDragRope", () => {
  it("creates the default number of points", () => {
    const r = computeDragRope({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(r).toHaveLength(18);
  });

  it("first point at source, last at target", () => {
    const r = computeDragRope({ x: 10, y: 20 }, { x: 100, y: 200 });
    expect(r[0].x).toBe(10);
    expect(r[0].y).toBe(20);
    const last = r[r.length - 1];
    expect(last.x).toBe(100);
    expect(last.y).toBe(200);
  });

  it("is a pure function of its inputs (no state, no lag)", () => {
    const a = computeDragRope({ x: 0, y: 0 }, { x: 200, y: 100 }, { sourceDir: SIDE.right });
    const b = computeDragRope({ x: 0, y: 0 }, { x: 200, y: 100 }, { sourceDir: SIDE.right });
    expect(a).toEqual(b);
  });

  it("collapses to source when source and target coincide", () => {
    const r = computeDragRope({ x: 50, y: 50 }, { x: 50, y: 50 });
    expect(r.every((p) => p.x === 50 && p.y === 50)).toBe(true);
  });

  it("bows interior points away from the straight line when there is distance", () => {
    const r = computeDragRope({ x: 0, y: 0 }, { x: 200, y: 0 });
    const mid = r[Math.floor(r.length / 2)];
    expect(Math.abs(mid.y)).toBeGreaterThan(0);
  });

  it("caps sag at maxSag regardless of distance", () => {
    const r = computeDragRope({ x: 0, y: 0 }, { x: 5000, y: 0 }, { maxSag: 60 });
    const mid = r[Math.floor(r.length / 2)];
    expect(Math.abs(mid.y)).toBeLessThanOrEqual(60 + 1e-6);
  });
});
