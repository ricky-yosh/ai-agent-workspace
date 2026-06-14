import { useEffect, type RefObject } from "react";

export function useEventListener<K extends keyof DocumentEventMap>(
  target: RefObject<HTMLElement | null> | Document | Window,
  event: K,
  handler: (e: DocumentEventMap[K]) => void,
  deps: unknown[] = [],
) {
  useEffect(() => {
    const el = target instanceof Document || target === window
      ? (target as EventTarget)
      : (target as RefObject<HTMLElement | null>).current;
    if (!el) return;
    el.addEventListener(event, handler as EventListener);
    return () => el.removeEventListener(event, handler as EventListener);
  }, [event, handler, ...deps]);
}
