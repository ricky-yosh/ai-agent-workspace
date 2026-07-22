import { describe, it, expect } from "vitest";
import { getBranchColor } from "./branchColors";

describe("getBranchColor", () => {
  it("returns a CSS variable string", () => {
    const color = getBranchColor("abc123");
    expect(color).toMatch(/^var\(--branch-color/);
  });

  it("is deterministic: same SHA always returns same color", () => {
    const sha = "a".repeat(40);
    expect(getBranchColor(sha)).toBe(getBranchColor(sha));
  });

  it("different SHAs can return different colors", () => {
    const colors = new Set<string>();
    for (let i = 0; i < 100; i++) {
      colors.add(getBranchColor(`sha-${i}`));
    }
    expect(colors.size).toBeGreaterThan(1);
  });
});
