import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function useTauriEvent(event: string, handler: () => void, deps: unknown[] = []) {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen(event, handler).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [event, handler, ...deps]);
}
