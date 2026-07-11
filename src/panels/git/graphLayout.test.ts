import { describe, it, expect } from "vitest";
import { computeLanes, type CommitTopology } from "./laneAssignment";
import { computeGraphLayout } from "./graphLayout";

function makeCommits(defs: [string, string[]][]): CommitTopology[] {
  return defs.map(([sha, parents]) => ({ sha, parent_hashes: parents }));
}

/**
 * Every parent edge must be drawn continuously: for a commit at (rc, cc) with a
 * parent at (rp, cp), the parent's column must be active in every intermediate
 * row (rc+1 .. rp-1). A gap here is what makes a branch look disconnected /
 * "fails to go all the way down" (the merge points into empty space).
 */
function assertEdgesContiguous(topo: CommitTopology[]): void {
  const positions = computeLanes(topo);
  const layout = computeGraphLayout(topo, positions);
  const byShaPos = new Map(positions.map((p) => [p.sha, p]));

  for (const c of topo) {
    const cp = byShaPos.get(c.sha)!;
    for (const parentSha of c.parent_hashes) {
      const pp = byShaPos.get(parentSha);
      if (!pp) continue;
      // Every intermediate row must draw the full lane (both halves) in the
      // parent's column so the edge is continuous end to end.
      for (let r = cp.row + 1; r < pp.row; r++) {
        expect(
          layout.segUp[r][pp.column] && layout.segDown[r][pp.column],
          `edge ${c.sha}->${parentSha} broken at row ${r} col ${pp.column}`,
        ).toBe(true);
      }
      // The parent dot must be entered from above.
      expect(layout.segUp[pp.row][pp.column]).toBe(true);
    }
  }
}

describe("computeGraphLayout", () => {
  it("linear history keeps the single lane active throughout", () => {
    assertEdgesContiguous(
      makeCommits([
        ["D", ["C"]],
        ["C", ["B"]],
        ["B", ["A"]],
        ["A", []],
      ]),
    );
  });

  it("merge: branch lane reaches all the way up to the merge commit", () => {
    // M (row1, on main) merges branch tip b3 (row3). Rows 2 must show the
    // branch lane so the merge connects to its second parent.
    const topo = makeCommits([
      ["m6", ["M"]],
      ["M", ["m5", "b3"]],
      ["m5", ["m4"]],
      ["b3", ["b2"]],
      ["b2", ["b1"]],
      ["b1", ["m4"]],
      ["m4", ["m3"]],
      ["m3", []],
    ]);
    assertEdgesContiguous(topo);

    const positions = computeLanes(topo);
    const layout = computeGraphLayout(topo, positions);
    const branchCol = positions.find((p) => p.sha === "b3")!.column;
    // Intermediate row between merge (row1) and branch tip (row3).
    expect(layout.segUp[2][branchCol] && layout.segDown[2][branchCol]).toBe(true);
  });

  it("side branch lane stops at its base commit — no overshoot beyond the end", () => {
    const topo = makeCommits([
      ["m6", ["M"]],
      ["M", ["m5", "b3"]],
      ["m5", ["m4"]],
      ["b3", ["b2"]],
      ["b2", ["b1"]],
      ["b1", ["m4"]],
      ["m4", ["m3"]],
      ["m3", []],
    ]);
    const positions = computeLanes(topo);
    const layout = computeGraphLayout(topo, positions);
    const branchCol = positions.find((p) => p.sha === "b3")!.column;
    const baseRow = positions.find((p) => p.sha === "b1")!.row;
    // The base dot continues downward in its own column to deliver the lane
    // into the checkout connector at the parent's row.
    expect(layout.segDown[baseRow][branchCol]).toBe(true);
    // The parent row has an upward entry in the side lane that feeds into the
    // checkout connector, but nothing continues below it.
    expect(layout.segUp[baseRow + 1][branchCol]).toBe(true);
    expect(layout.segDown[baseRow + 1][branchCol]).toBe(false);
    // Beyond the parent row the side lane is gone.
    for (let r = baseRow + 2; r < topo.length; r++) {
      expect(
        layout.segUp[r][branchCol] || layout.segDown[r][branchCol],
        `side lane overshoots below parent at row ${r}`,
      ).toBe(false);
    }
  });

  it("an unmerged branch tip has no line above its dot (clean stub)", () => {
    // b2 is a branch tip that nothing merges — its lane must start at its dot.
    const topo = makeCommits([
      ["b2", ["b1"]],
      ["m2", ["m1"]],
      ["b1", ["base"]],
      ["m1", ["base"]],
      ["base", []],
    ]);
    const positions = computeLanes(topo);
    const layout = computeGraphLayout(topo, positions);
    const tip = positions.find((p) => p.sha === "b2")!;
    expect(layout.segUp[tip.row][tip.column]).toBe(false);
    expect(layout.segDown[tip.row][tip.column]).toBe(true);
  });

  it("octopus merge: every parent lane connects to the merge", () => {
    assertEdgesContiguous(
      makeCommits([
        ["M", ["a", "b", "c"]],
        ["a", ["z"]],
        ["b", ["z"]],
        ["c", ["z"]],
        ["z", []],
      ]),
    );
  });
});
