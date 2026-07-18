import { invoke } from "@tauri-apps/api/core";

// Dev-only: mirror frontend console errors/warnings and uncaught errors into a
// log file at the repo root (`frontend-console.log`) via the `log_frontend`
// Tauri command, so they can be tailed outside the webview devtools.
//
// Enabled only in dev (import.meta.env.DEV). Failures to forward are swallowed
// to avoid recursive logging loops.

function forward(level: string, args: unknown[]): void {
  const message = args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
  // Fire-and-forget; never await, never throw.
  invoke("log_frontend", { level, message }).catch(() => {});
}

export function installDevConsoleCapture(): void {
  if (!import.meta.env.DEV) return;

  // Start each dev session with a fresh log.
  invoke("clear_frontend_log").catch(() => {});

  const original = {
    error: console.error.bind(console),
    warn: console.warn.bind(console),
  };

  console.error = (...args: unknown[]) => {
    forward("error", args);
    original.error(...args);
  };
  console.warn = (...args: unknown[]) => {
    forward("warn", args);
    original.warn(...args);
  };

  window.addEventListener("error", (event) => {
    forward("uncaught", [event.error ?? event.message]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    forward("unhandledrejection", [event.reason]);
  });
}
