import { useRef, useMemo } from "react";
import { useVirtualizer as useTanstackVirtualizer } from "@tanstack/react-virtual";
import type { ReactVirtualizer } from "@tanstack/react-virtual";

/** Default row height for uniform (code) mode, in pixels. */
const DEFAULT_UNIFORM_ROW_HEIGHT = 20;

/** Number of extra rows to render above/below the visible window. */
const OVERSCAN = 5;

export interface UseVirtualRowsOptions {
  /** The array of row strings to virtualize. */
  rows: string[];
  /**
   * Row height strategy.
   * - A `number` enables uniform row height (all rows assumed same size).
   * - `'variable'` enables dynamic measurement per row (for markdown, etc.).
   */
  rowHeight: number | "variable";
}

export interface VirtualRow {
  /** The 0-based index into the original `rows` array. */
  index: number;
  /** The row string content. */
  row: string;
}

export interface UseVirtualRowsResult {
  /** Only the rows that should be rendered (visible + overscan). */
  visibleRows: VirtualRow[];
  /** Total scrollable content height in pixels. */
  totalHeight: number;
  /** The underlying @tanstack/react-virtual virtualizer instance. */
  virtualizer: ReactVirtualizer<HTMLDivElement, Element>;
  /** Ref to attach to the scroll container element. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Compute the estimated size for a single row when using uniform heights.
 */
function uniformEstimateSize(height: number): () => number {
  return () => height;
}

/**
 * React hook that virtualizes a list of rows, returning only the visible slice
 * plus top/bottom spacer heights. Supports both uniform row heights (for code
 * files) and variable row heights (for markdown / mixed content).
 *
 * @example
 * ```tsx
 * const { visibleRows, totalHeight, virtualizer, scrollRef } = useVirtualRows({
 *   rows: fileLines,
 *   rowHeight: 20,          // uniform 20px per line
 * });
 *
 * return (
 *   <div ref={scrollRef} style={{ height: '100%', overflow: 'auto' }}>
 *     <div style={{ height: totalHeight, position: 'relative' }}>
 *       {virtualizer.getVirtualItems().map((vRow) => (
 *         <div key={vRow.key} style={{ position: 'absolute', top: vRow.start, height: vRow.size, width: '100%' }}>
 *           {rows[vRow.index]}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualRows({
  rows,
  rowHeight,
}: UseVirtualRowsOptions): UseVirtualRowsResult {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isUniform = typeof rowHeight === "number";

  const estimateSize = useMemo(() => {
    if (isUniform) {
      return uniformEstimateSize(rowHeight);
    }
    // Variable: return a default estimate; actual size is measured by measureElement.
    return () => DEFAULT_UNIFORM_ROW_HEIGHT;
  }, [isUniform, rowHeight]);

  const virtualizer = useTanstackVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: OVERSCAN,
    ...(isUniform
      ? {}
      : {
          // For variable rows, measure each element when it mounts.
          measureElement: (element: Element) => {
            return element.getBoundingClientRect().height;
          },
        }),
  });

  const virtualItems = virtualizer.getVirtualItems();

  const visibleRows: VirtualRow[] = useMemo(() => {
    return virtualItems.map((item) => ({
      index: item.index,
      row: rows[item.index],
    }));
  }, [virtualItems, rows]);

  const totalHeight = virtualizer.getTotalSize();

  return {
    visibleRows,
    totalHeight,
    virtualizer,
    scrollRef,
  };
}

/**
 * Pure utility: compute the visible row index range given a scroll offset,
 * viewport height, total rows, row height, and overscan.
 *
 * Useful for testing the windowing logic without a DOM.
 */
export function computeVisibleRange(params: {
  scrollTop: number;
  viewportHeight: number;
  totalRows: number;
  rowHeight: number;
  overscan?: number;
}): { startIndex: number; endIndex: number } {
  const { scrollTop, viewportHeight, totalRows, rowHeight, overscan = OVERSCAN } = params;

  if (totalRows === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const rawStart = Math.floor(scrollTop / rowHeight);
  const rawEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight);

  const startIndex = Math.min(totalRows, Math.max(0, rawStart - overscan));
  const endIndex = Math.min(totalRows, rawEnd + overscan);

  return { startIndex, endIndex };
}
