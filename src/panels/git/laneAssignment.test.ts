import { describe, it, expect } from "vitest";
import { computeLanes, CommitTopology } from "./laneAssignment";

function makeCommits(defs: [string, string[]][]): CommitTopology[] {
  return defs.map(([sha, parents]) => ({ sha, parent_hashes: parents }));
}

describe("computeLanes", () => {
  it("linear history: all commits in same lane", () => {
    const commits = makeCommits([
      ["D", ["C"]],
      ["C", ["B"]],
      ["B", ["A"]],
      ["A", []],
    ]);
    const result = computeLanes(commits);
    for (const pos of result) {
      expect(pos.column).toBe(0);
    }
  });

  it("single branch fork: two lanes diverge", () => {
    const commits = makeCommits([
      ["C", ["A"]],
      ["B", ["A"]],
      ["A", []],
    ]);
    const result = computeLanes(commits);
    const a = result.find(r => r.sha === "A")!;
    const b = result.find(r => r.sha === "B")!;
    const c = result.find(r => r.sha === "C")!;
    expect(a.column).toBe(0);
    expect(b.column).not.toBe(c.column);
  });

  it("octopus merge: 3 parents merge into one child", () => {
    const commits = makeCommits([
      ["D", ["A", "B", "C"]],
      ["C", []],
      ["B", []],
      ["A", []],
    ]);
    const result = computeLanes(commits);
    const d = result.find(r => r.sha === "D")!;
    expect(d).toBeDefined();
    expect(d.column).toBeGreaterThanOrEqual(0);
    for (const pos of result) {
      expect(pos.row).toBeGreaterThanOrEqual(0);
      expect(pos.column).toBeGreaterThanOrEqual(0);
    }
  });

  it("cross-branch merge: merging from a rightward branch", () => {
    const commits = makeCommits([
      ["C", ["A", "B"]],
      ["D", ["A", "B"]],
      ["B", []],
      ["A", []],
    ]);
    const result = computeLanes(commits);
    const c = result.find(r => r.sha === "C")!;
    const d = result.find(r => r.sha === "D")!;
    expect(c.column).not.toBe(d.column);
  });

  it("branch collapse: branch ends, its lane becomes available", () => {
    const commits = makeCommits([
      ["D", ["C"]],
      ["E", ["B"]],
      ["C", ["B"]],
      ["B", ["A"]],
      ["A", []],
    ]);
    const result = computeLanes(commits);
    expect(result.length).toBe(5);
    const d = result.find(r => r.sha === "D")!;
    expect(d.column).toBeGreaterThanOrEqual(0);
  });

  it("fast-forward chain: many single-parent commits in one lane", () => {
    const defs: [string, string[]][] = [];
    for (let i = 49; i >= 0; i--) {
      defs.push([`commit-${i}`, i === 0 ? [] : [`commit-${i - 1}`]]);
    }
    const commits = makeCommits(defs);
    const result = computeLanes(commits);
    expect(result.length).toBe(50);
    for (const pos of result) {
      expect(pos.column).toBe(0);
    }
  });

  it("recycles terminated column after branch-and-merge", () => {
    const commits = makeCommits([
      ["F", ["E", "branch-2"]],
      ["E", ["D"]],
      ["branch-2", ["D"]],
      ["D", ["C", "branch-1"]],
      ["C", ["B"]],
      ["branch-1", ["B"]],
      ["B", ["A"]],
      ["A", []],
    ]);

    const result = computeLanes(commits);
    const maxCol = Math.max(...result.map(r => r.column));
    expect(maxCol).toBe(1);
  });

  it("reuses columns across multiple short-lived branches", () => {
    const commits = makeCommits([
      ["merge-2", ["cont-1", "br-2"]],
      ["br-2", ["cont-1"]],
      ["cont-1", ["merge-1"]],
      ["merge-1", ["cont-0", "br-1"]],
      ["br-1", ["cont-0"]],
      ["cont-0", ["base"]],
      ["base", []],
    ]);

    const result = computeLanes(commits);
    const maxCol = Math.max(...result.map(r => r.column));
    expect(maxCol).toBeLessThanOrEqual(1);
  });
});
