import { describe, it, expect } from "vitest";
import { findNearestHandle } from "./snapping";

describe("findNearestHandle", () => {
  const rect = { x: 100, y: 100, width: 100, height: 60 };
  
  it("returns top when point is above center", () => {
    const r = findNearestHandle({ x: 150, y: 80 }, rect);
    expect(r.side).toBe("top");
  });
  it("returns right when point is right of center", () => {
    const r = findNearestHandle({ x: 220, y: 130 }, rect);
    expect(r.side).toBe("right");
  });
  it("returns bottom when point is below", () => {
    const r = findNearestHandle({ x: 150, y: 180 }, rect);
    expect(r.side).toBe("bottom");
  });
  it("returns left when point is left", () => {
    const r = findNearestHandle({ x: 80, y: 130 }, rect);
    expect(r.side).toBe("left");
  });
  it("handles corner point", () => {
    const r = findNearestHandle({ x: 0, y: 0 }, rect);
    expect(r.side).toBe("left");
  });
  it("handles zero-size rect", () => {
    const r = findNearestHandle({ x: 50, y: 50 }, { x: 50, y: 50, width: 0, height: 0 });
    expect(r.midpoint.x).toBe(50);
    expect(r.midpoint.y).toBe(50);
  });
});
