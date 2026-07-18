import { describe, expect, it } from "vitest";
import { resolveNearestFacingSides } from "./geometry";

describe("resolveNearestFacingSides", () => {
  it("picks the near perpendicular sides for wide cards offset diagonally", () => {
    // S.bottom (100,60) -> T.top (180,70) is dist ~80.6, far closer than the
    // center-facing S.right (200,30) -> T.left (80,100) at ~138.9.
    const s = { x: 0, y: 0, width: 200, height: 60 };
    const t = { x: 80, y: 70, width: 200, height: 60 };
    expect(resolveNearestFacingSides(s, t)).toEqual({
      srcSide: "bottom",
      tgtSide: "top",
    });
  });

  it("keeps opposing sides for cards placed side by side", () => {
    const s = { x: 0, y: 0, width: 120, height: 120 };
    const t = { x: 300, y: 0, width: 120, height: 120 };
    expect(resolveNearestFacingSides(s, t)).toEqual({
      srcSide: "right",
      tgtSide: "left",
    });
  });

  it("keeps opposing sides for cards stacked vertically", () => {
    const s = { x: 0, y: 0, width: 120, height: 120 };
    const t = { x: 0, y: 300, width: 120, height: 120 };
    expect(resolveNearestFacingSides(s, t)).toEqual({
      srcSide: "bottom",
      tgtSide: "top",
    });
  });
});
