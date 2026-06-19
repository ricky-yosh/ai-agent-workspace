import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

async function safeUnlisten(fn: UnlistenFn) {
  try { await fn(); } catch {}
}

export function useTauriEvent<T = void>(event: string, handler: (payload: T) => void, deps: unknown[] = []) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    const unlistens = new Set<UnlistenFn>();

    listen<T>(event, (e) => handlerRef.current(e.payload)).then((fn) => {
      unlistens.add(fn);
      if (cancelled) {
        safeUnlisten(fn);
        unlistens.delete(fn);
      }
    });

    return () => {
      cancelled = true;
      for (const fn of unlistens) {
        safeUnlisten(fn);
      }
      unlistens.clear();
    };
  }, [event, ...deps]);
}
