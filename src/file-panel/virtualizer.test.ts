import { describe, it, expect } from "vitest";
import { computeVisibleRange } from "./virtualizer";

describe("computeVisibleRange", () => {
  const ROW_HEIGHT = 20;
  const OVERSCAN = 5;

  // ── Empty content ──────────────────────────────────────────────
  it("returns zero-length range for empty content", () => {
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 600,
      totalRows: 0,
      rowHeight: ROW_HEIGHT,
    });
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(0);
  });

  // ── Single-line file ───────────────────────────────────────────
  it("renders single-line file (one row that fits in viewport)", () => {
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 600,
      totalRows: 1,
      rowHeight: ROW_HEIGHT,
    });
    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBe(1);
  });

  it("single-line file clamps endIndex to totalRows", () => {
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 600,
      totalRows: 1,
      rowHeight: ROW_HEIGHT,
    });
    // Overscan would push endIndex to 6, but totalRows=1 clamps it.
    expect(range.endIndex).toBe(1);
  });

  // ── Uniform rows: basic visible slice ──────────────────────────
  it("computes correct visible slice for a scrolled viewport", () => {
    // 30 rows, 20px each = 600px total. Viewport shows rows 10-30 (scrollTop=200, height=400).
    // rawStart = floor(200/20) = 10, rawEnd = ceil(600/20) = 30
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 400,
      totalRows: 30,
      rowHeight: ROW_HEIGHT,
    });
    expect(range.startIndex).toBe(5);  // 10 - 5 overscan
    expect(range.endIndex).toBe(30);   // 30, clamped to totalRows
  });

  it("clamps startIndex to 0 at top of list", () => {
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 400,
      totalRows: 30,
      rowHeight: ROW_HEIGHT,
    });
    // rawStart=0, minus 5 overscan → clamped to 0
    expect(range.startIndex).toBe(0);
    // rawEnd=ceil(400/20)=20, +5 overscan = 25
    expect(range.endIndex).toBe(25);
  });

  it("clamps endIndex to totalRows at bottom of list", () => {
    // Scroll to very bottom: scrollTop = 600 - 400 = 200 (last page)
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 400,
      totalRows: 30,
      rowHeight: ROW_HEIGHT,
    });
    // rawEnd = ceil(600/20) = 30 → +5 overscan = 35, clamped to 30
    expect(range.endIndex).toBe(30);
  });

  // ── Overscan parameter ─────────────────────────────────────────
  it("respects custom overscan value", () => {
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 400,
      totalRows: 100,
      rowHeight: ROW_HEIGHT,
      overscan: 2,
    });
    // rawStart = 10, rawEnd = 30
    expect(range.startIndex).toBe(8);   // 10 - 2
    expect(range.endIndex).toBe(32);    // 30 + 2
  });

  it("overscan of 0 returns exact visible range", () => {
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 400,
      totalRows: 100,
      rowHeight: ROW_HEIGHT,
      overscan: 0,
    });
    expect(range.startIndex).toBe(10);
    expect(range.endIndex).toBe(30);
  });

  // ── Very large file ────────────────────────────────────────────
  it("handles very large row counts (simulating 100MB file)", () => {
    // ~5M rows × 20 bytes per line ≈ 100MB
    const totalRows = 5_000_000;
    const range = computeVisibleRange({
      scrollTop: 40_000_000, // deep in the file
      viewportHeight: 800,
      totalRows,
      rowHeight: ROW_HEIGHT,
    });
    const rawStart = Math.floor(40_000_000 / 20); // 2_000_000
    const rawEnd = Math.ceil((40_000_800) / 20);  // 2_000_040
    expect(range.startIndex).toBe(rawStart - OVERSCAN);
    expect(range.endIndex).toBe(rawEnd + OVERSCAN);
    // Total rendered rows is tiny relative to 5M
    expect(range.endIndex - range.startIndex).toBe(40 + 2 * OVERSCAN);
  });

  // ── Spacer height calculations ─────────────────────────────────
  it("top spacer height is startIndex × rowHeight", () => {
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 400,
      totalRows: 100,
      rowHeight: ROW_HEIGHT,
    });
    const topSpacer = range.startIndex * ROW_HEIGHT;
    expect(topSpacer).toBe(5 * ROW_HEIGHT); // 100px
  });

  it("bottom spacer height is (totalRows - endIndex) × rowHeight", () => {
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 400,
      totalRows: 100,
      rowHeight: ROW_HEIGHT,
    });
    const bottomSpacer = (100 - range.endIndex) * ROW_HEIGHT;
    expect(bottomSpacer).toBe((100 - 35) * ROW_HEIGHT); // 1300px
  });

  it("total height equals topSpacer + visibleHeight + bottomSpacer", () => {
    const totalRows = 100;
    const range = computeVisibleRange({
      scrollTop: 200,
      viewportHeight: 400,
      totalRows,
      rowHeight: ROW_HEIGHT,
    });
    const topSpacer = range.startIndex * ROW_HEIGHT;
    const visibleHeight = (range.endIndex - range.startIndex) * ROW_HEIGHT;
    const bottomSpacer = (totalRows - range.endIndex) * ROW_HEIGHT;
    expect(topSpacer + visibleHeight + bottomSpacer).toBe(totalRows * ROW_HEIGHT);
  });

  // ── Edge case: scrollTop past the end ──────────────────────────
  it("scrolling past the last row produces empty visible range", () => {
    const totalRows = 50;
    const range = computeVisibleRange({
      scrollTop: 2000, // way beyond 50 * 20 = 1000
      viewportHeight: 400,
      totalRows,
      rowHeight: ROW_HEIGHT,
    });
    expect(range.startIndex).toBe(totalRows);
    expect(range.endIndex).toBe(totalRows);
  });
});
