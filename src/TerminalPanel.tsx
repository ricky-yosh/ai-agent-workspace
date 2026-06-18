import { useRef, useEffect, useState, useCallback, type RefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke, Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "@xterm/xterm/css/xterm.css";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelContext } from "./PanelContext";
import { pathsEqual } from "./utils/pathUtils";
import { requestWebgl, releaseWebgl, disposeWebgl } from "./webglPool";

interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  // NOTE: the WebGL addon is deliberately NOT held here anymore. Its lifecycle
  // is decoupled from the Terminal's and owned entirely by the bounded
  // renderer pool in ./webglPool. The Terminal stays cached (surviving
  // transient unmounts) whether or not it currently has a GPU renderer attached.
  ptyId: string | null;
  opened: boolean;
}

class TerminalCache {
  private map = new Map<string, CachedTerminal>();

  get(key: string): CachedTerminal | undefined {
    return this.map.get(key);
  }

  set(key: string, value: CachedTerminal): void {
    this.map.set(key, value);
  }

  dispose(key: string): void {
    const cached = this.map.get(key);
    if (!cached) return;
    cached.terminal.dispose();
    this.map.delete(key);
  }
}

const terminalCache = new TerminalCache();

const ptyExitCallbacks = new Map<string, () => void>();

/**
 * Permanently tear down a terminal. Call this from the explicit panel-close
 * path (e.g. consuming/joining a pane, or switching a pane away from a
 * terminal) — NOT from a React unmount, which is transient (StrictMode /
 * hide-don't-unmount) and must keep the cached terminal alive for reattach.
 * Disposes the cached xterm instance, kills the backing PTY, and drops the
 * exit callback so nothing leaks.
 */
export function disposeTerminal(terminalId: string): void {
  // Free the GPU/WebGL context first (no-op if this terminal was on the DOM
  // renderer), then drop the cached Terminal and kill the PTY. Order matters
  // only loosely, but freeing the renderer before disposing the Terminal keeps
  // the addon's canvas references valid while we tear the context down.
  disposeWebgl(terminalId);
  terminalCache.dispose(terminalId);
  ptyExitCallbacks.delete(terminalId);
  invoke("pty_kill", { terminalId }).catch(() => {});
}

let globalListenersInitialized = false;
function ensureGlobalListeners(): void {
  if (globalListenersInitialized) return;
  globalListenersInitialized = true;
  listen<{ terminal_id: string }>("pty-exit", (event) => {
    ptyExitCallbacks.get(event.payload.terminal_id)?.();
  });
}
ensureGlobalListeners();

function fitAndFocus(
  terminal: Terminal,
  fitAddon: FitAddon,
  isMounted: { current: boolean },
): void {
  requestAnimationFrame(() => {
    if (isMounted.current) {
      fitAddon.fit();
      terminal.focus();
    }
  });
}

function ensureOpened(cacheKey: string, container: HTMLDivElement): void {
  const cached = terminalCache.get(cacheKey);
  if (!cached || cached.opened) return;
  cached.terminal.open(container);
  cached.opened = true;
  requestAnimationFrame(() => {
    const c = terminalCache.get(cacheKey);
    if (!c) return;
    c.fitAddon.fit();
    c.terminal.focus();
  });
}

function useXtermTerminal(
  containerRef: RefObject<HTMLDivElement | null>,
  cacheKey: string,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isMounted = { current: true };
    const cached = terminalCache.get(cacheKey);

    if (cached) {
      const { terminal, fitAddon } = cached;
      if (cached.opened && terminal.element) {
        container.appendChild(terminal.element);
        fitAndFocus(terminal, fitAddon, isMounted);
      } else if (!cached.opened && container.offsetParent !== null) {
        ensureOpened(cacheKey, container);
      }
    } else {
      const terminal = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
        theme: {
          background: "#1e1e1e",
          foreground: "#cccccc",
          cursor: "#cccccc",
          selectionBackground: "#264f78",
        },
      });

      const rawOpts = (terminal as any)._core?.optionsService?.rawOptions;
      if (rawOpts && !rawOpts.allowProposedApi) {
        rawOpts.allowProposedApi = true;
      }

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      // NOTE: no WebglAddon is created here. The bounded renderer pool attaches
      // one on reveal (useTerminalReveal -> requestWebgl) only when there's a
      // free GPU context slot, and detaches it on hide/dispose. Until then the
      // terminal renders via xterm's built-in DOM renderer, which can never
      // exhaust WebGL contexts. See ./webglPool for the full rationale.

      terminal.onData((data) => {
        const c = terminalCache.get(cacheKey);
        if (c?.ptyId) {
          invoke("pty_write", { ptyId: c.ptyId, data }).catch((err) => {
            if (String(err).includes("PTY not found")) {
              c.ptyId = null;
            }
          });
        }
      });

      // Store in cache first (with opened:false) before calling ensureOpened,
      // so ensureOpened can find the entry when checking visibility.
      terminalCache.set(cacheKey, { terminal, fitAddon, ptyId: null, opened: false });

      // Open immediately only if the container is currently visible.
      // If hidden (display:none on ancestor), defer to first reveal via useTerminalReveal.
      if (container.offsetParent !== null) {
        ensureOpened(cacheKey, container);
      }
    }

    return () => {
      isMounted.current = false;
      // Detach (but DO NOT dispose) the terminal on unmount. The cache is meant
      // to survive transient unmounts ("hide don't unmount" / StrictMode's
      // mount→unmount→remount), so the remount can reattach the same terminal.
      // Disposing here destroyed the terminal and forced the remount to build a
      // new one, which then diverged from the PTY output Channel the backend had
      // already bound to the original terminal (idempotent pty_spawn drops the
      // remount's new channel) — leaving a live terminal wired to nothing.
      // Real disposal must happen on an explicit panel close, not here.
      const last = terminalCache.get(cacheKey);
      if (last?.terminal.element && last.terminal.element.parentNode === container) {
        container.removeChild(last.terminal.element);
      }
    };
  }, [cacheKey]);
}

function spawnPtyWithChannel(
  terminalId: string,
  sessionId: string,
  onBytes: (bytes: ArrayBuffer) => void,
): Promise<{ pty_id: string }> {
  // Raw PTY output is streamed as binary (InvokeResponseBody::Raw on the Rust
  // side), which arrives here as an ArrayBuffer — no JSON number-array encoding.
  // Process exit is handled separately via the "pty-exit" event (ptyExitCallbacks).
  const onEvent = new Channel<ArrayBuffer>();
  onEvent.onmessage = onBytes;
  return invoke<{ pty_id: string }>("pty_spawn", {
    terminalId,
    sessionId,
    onEvent,
  });
}

function usePty(
  cacheKey: string,
  terminalId: string,
  sessionId: string,
): { isSpawning: boolean; isExited: boolean; restartTerminal: () => void } {
  const [isSpawning, setIsSpawning] = useState(true);
  const [isExited, setIsExited] = useState(false);

  const restartTerminal = useCallback(() => {
    const cached = terminalCache.get(cacheKey);
    if (!cached) return;
    cached.ptyId = null;
    setIsExited(false);
    setIsSpawning(true);
    spawnPtyWithChannel(terminalId, sessionId, (bytes) => {
      cached.terminal.write(new Uint8Array(bytes));
    })
      .then(({ pty_id }) => {
        cached.ptyId = pty_id;
        setIsSpawning(false);
      })
      .catch((err) => {
        cached.terminal.write(`\r\nFailed to spawn terminal: ${err}\r\n`);
        setIsSpawning(false);
      });
  }, [cacheKey, terminalId, sessionId]);

  useEffect(() => {
    const isMounted = { current: true };
    const cached = terminalCache.get(cacheKey);
    if (!cached) return;

    if (cached.ptyId) {
      setIsSpawning(false);
    } else {
      spawnPtyWithChannel(terminalId, sessionId, (bytes) => {
        cached.terminal.write(new Uint8Array(bytes));
      })
        .then(({ pty_id }) => {
          if (!isMounted.current) return;
          cached.ptyId = pty_id;
          setIsSpawning(false);
        })
        .catch((err) => {
          if (!isMounted.current) return;
          cached.terminal.write(`\r\nFailed to spawn terminal: ${err}\r\n`);
          setIsSpawning(false);
        });
    }

    ptyExitCallbacks.set(terminalId, () => {
      const c = terminalCache.get(cacheKey);
      if (!c) return;
      c.ptyId = null;
      if (isMounted.current) {
        setIsExited(true);
        setIsSpawning(false);
      }
    });

    return () => {
      isMounted.current = false;
      ptyExitCallbacks.delete(terminalId);
    };
  }, [cacheKey, sessionId]);

  return { isSpawning, isExited, restartTerminal };
}

function useTerminalDragDrop(cacheKey: string): void {
  const { path, focusedPath } = usePanelContext();
  const focusedPathRef = useRef(focusedPath);
  focusedPathRef.current = focusedPath;
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    const cached = terminalCache.get(cacheKey);
    if (!cached) return;

    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      const c = terminalCache.get(cacheKey);
      if (!c || !c.ptyId) return;
      if (event.payload.type === "drop" && event.payload.paths.length > 0) {
        if (!pathsEqual(focusedPathRef.current, pathRef.current)) return;
        for (const p of event.payload.paths) {
          invoke("pty_write", { ptyId: c.ptyId, data: p + " " });
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [cacheKey]);
}

function useTerminalResize(
  containerRef: RefObject<HTMLDivElement | null>,
  cacheKey: string,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      const c = terminalCache.get(cacheKey);
      if (!c) return;
      try {
        const dims = c.fitAddon.proposeDimensions();
        if (dims && dims.cols > 0 && dims.rows > 0) {
          c.fitAddon.fit();
        }
      } catch {
        // terminal is in a hidden container
      }
      if (c.ptyId) {
        const { cols, rows } = c.terminal;
        invoke("pty_resize", { ptyId: c.ptyId, cols, rows }).catch((err) => {
          if (String(err).includes("PTY not found")) {
            c.ptyId = null;
          }
        });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [cacheKey]);
}

function useTerminalReveal(
  containerRef: RefObject<HTMLDivElement | null>,
  cacheKey: string,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          // Lazy-open: open a deferred terminal on first reveal.
          ensureOpened(cacheKey, container);
          // Request a WebGL renderer now that the terminal is visible AND
          // opened (terminal.element exists). The pool caps concurrent contexts
          // and gracefully no-ops onto the DOM renderer if no slot is free.
          // ensureOpened MUST run first so the addon has a mounted element.
          const revealed = terminalCache.get(cacheKey);
          if (revealed) requestWebgl(cacheKey, revealed.terminal);
          // After the pane has laid out post-reveal, fit the terminal to the
          // settled container size and focus it. Without this, a terminal first
          // revealed during the display:none->block transition gets fit against
          // a not-yet-laid-out container and stays stuck at ~80x24 in the corner.
          setTimeout(() => {
            const c = terminalCache.get(cacheKey);
            if (!c) return;
            c.fitAddon.fit();
            c.terminal.focus();
          }, 300);
        } else {
          // Hidden: mark not-visible (frees this terminal's context for eviction
          // by a newly-revealed one) and schedule idle reaping of its WebGL
          // addon after the grace period. The Terminal instance stays cached.
          releaseWebgl(cacheKey);
        }
      },
      { threshold: 0 },
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [cacheKey]);
}

function TerminalPanel({ panelType: _panelType }: PanelProps) {
  const { workspaceId: _workspaceId, sessionId, path: _path, terminalId: contextTerminalId } = usePanelContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef(contextTerminalId ?? crypto.randomUUID());
  const terminalId = terminalIdRef.current;
  const cacheKey = terminalId;

  useXtermTerminal(containerRef, cacheKey);
  const { isSpawning, isExited, restartTerminal } = usePty(cacheKey, terminalId, sessionId);
  useTerminalDragDrop(cacheKey);
  useTerminalResize(containerRef, cacheKey);
  useTerminalReveal(containerRef, cacheKey);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#1e1e1e" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
        onClick={() => {
          const c = terminalCache.get(cacheKey);
          if (c) c.terminal.focus();
        }}
      />
      {isSpawning && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(30, 30, 30, 0.9)",
            color: "var(--text-muted, #888)",
            fontSize: 13,
            fontFamily: "inherit",
            zIndex: 10,
          }}
        >
          Connecting…
        </div>
      )}
      {isExited && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(30, 30, 30, 0.9)",
            color: "var(--text-muted, #888)",
            fontSize: 13,
            fontFamily: "inherit",
            zIndex: 10,
            cursor: "pointer",
          }}
          onClick={restartTerminal}
          onKeyDown={(e) => { if (e.key === "Enter") restartTerminal(); }}
          tabIndex={0}
        >
          Process exited — press Enter to restart
        </div>
      )}
    </div>
  );
}

registerPanel("terminal", "Terminal", TerminalPanel);

export default TerminalPanel;
