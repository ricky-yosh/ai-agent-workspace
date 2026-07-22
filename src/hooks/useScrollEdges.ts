import { useState, useEffect, type RefObject } from "react";

export interface ScrollEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
  axis: "vertical" | "horizontal" | "both" = "vertical"
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({
    top: false,
    bottom: false,
    left: false,
    right: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      const el = ref.current;
      if (!el) return;
      const threshold = 1;
      const vertical = axis === "vertical" || axis === "both";
      const horizontal = axis === "horizontal" || axis === "both";

      setEdges({
        top: vertical ? el.scrollTop > threshold : false,
        bottom: vertical
          ? el.scrollTop + el.clientHeight < el.scrollHeight - threshold
          : false,
        left: horizontal ? el.scrollLeft > threshold : false,
        right: horizontal
          ? el.scrollLeft + el.clientWidth < el.scrollWidth - threshold
          : false,
      });
    }

    measure();

    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Observe children for content changes
    for (const child of el.children) {
      observer.observe(child);
    }

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [ref, axis]);

  return edges;
}
