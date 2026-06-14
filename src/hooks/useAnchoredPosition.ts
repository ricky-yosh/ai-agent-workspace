import { useLayoutEffect, type RefObject } from "react";

interface AnchoredPositionOptions {
  anchorX: number;
  anchorY: number;
  enabled: boolean;
}

export function useAnchoredPosition(
  ref: RefObject<HTMLElement | null>,
  { anchorX, anchorY, enabled }: AnchoredPositionOptions
) {
  useLayoutEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const { innerWidth: w, innerHeight: h } = window;
    let left = anchorX;
    let top = anchorY;
    if (left + rect.width > w - 4) left = w - rect.width - 4;
    if (left < 4) left = 4;
    if (top + rect.height > h - 4) top = top - rect.height;
    if (top < 4) top = 4;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [anchorX, anchorY, enabled]);
}
