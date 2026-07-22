import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Mock @tanstack/react-virtual so useVirtualRows can work in jsdom.
 * Returns ALL rows as virtual items (no windowing) to test rendering.
 */
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number; estimateSize?: () => number; getScrollElement?: () => HTMLElement | null }) => {
    const count = options.count;
    const sizeFn = options.estimateSize ?? (() => 20);
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      start: i * sizeFn(),
      size: sizeFn(),
      key: i,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * sizeFn(),
    };
  },
}));

import { PlainTextRenderer } from "./PlainTextRenderer";

describe("PlainTextRenderer", () => {
  it("renders lines with line numbers", () => {
    const lines = ["line 1", "line 2", "line 3"].join("\n");
    render(<PlainTextRenderer content={lines} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("line 1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("line 2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("line 3")).toBeTruthy();
  });

  it("renders empty content without crashing", () => {
    render(<PlainTextRenderer content="" />);
    // Empty string splits to [""] which renders one row
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("renders single line", () => {
    render(<PlainTextRenderer content="hello" />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("renders many lines", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    render(<PlainTextRenderer content={lines} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("line 100")).toBeTruthy();
  });
});
