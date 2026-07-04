import { useRef, useEffect, useState, useCallback, type RefObject } from "react";
import { Terminal, type ITerminalOptions } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke, Channel } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "@xterm/xterm/css/xterm.css";
import "./TerminalPanel.css";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelIdentity, usePanelFocus } from "./PanelContext";
import { matchesAnyShortcut, TERMINAL_PASSTHROUGH_SHORTCUTS } from "./hooks/useKeyboardShortcuts";
import type { Screen } from "./types/screen";
import { safeInvoke } from "./safeInvoke";
import { useTerminalCache } from "./providers/TerminalCacheProvider";
import { useWebGLPool } from "./providers/WebGLPoolProvider";
import type { TerminalCacheManager } from "./providers/TerminalCacheProvider";
import { TOKENS } from "./themes";

interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  // NOTE: the WebGL addon is deliberately NOT held here anymore. Its lifecycle
  // is decoupled from the Terminal's and owned entirely by the bounded
  // renderer pool in ./webglPool. The Terminal stays cached (surviving
  // transient unmounts) whether or not it currently has a GPU renderer attached.
  ptyId: string | null;
  opened: boolean;
  // Running count of output bytes parsed by xterm but not yet acked to the
  // backend's flow controller. Flushed (via pty_ack) once it crosses the ack
  // threshold. Drives backpressure so heavy output can't pin the main thread.
  ackBytes: number;
}

// VSCode's FlowControlConstants.CharCountAckSize: accumulate this many parsed
// bytes before sending an ack. Must be <= the backend's LOW_WATERMARK or the
// PTY could pause and never get an ack large enough to resume.
const ACK_FLUSH_BYTES = 5000;

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

function ensureOpened(cacheKey: string, container: HTMLDivElement, manager: TerminalCacheManager): void {
  const cached = manager.getTerminal(cacheKey);
  if (!cached || cached.opened) return;
  cached.terminal.open(container);
  cached.opened = true;
  requestAnimationFrame(() => {
    const c = manager.getTerminal(cacheKey);
    if (!c) return;
    c.fitAddon.fit();
    c.terminal.focus();
  });
}

function useXtermTerminal(
  containerRef: RefObject<HTMLDivElement | null>,
  cacheKey: string,
  manager: TerminalCacheManager,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isMounted = { current: true };
    const cached = manager.getTerminal(cacheKey);

    if (cached) {
      const { terminal, fitAddon } = cached;
      if (cached.opened && terminal.element) {
        container.appendChild(terminal.element);
        fitAndFocus(terminal, fitAddon, isMounted);
      } else if (!cached.opened && container.offsetParent !== null) {
        ensureOpened(cacheKey, container, manager);
      }
    } else {
      const terminal = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
        scrollback: 10000,
        smoothScrollDuration: 125,
        minimumContrastRatio: 4.5,
        drawBoldTextInBrightColors: true,
        rescaleOverlappingGlyphs: true,
        // fastScrollModifier exists at runtime but is missing from v6's bundled
        // typings; narrow the cast rather than widening the whole options object.
        ...({ fastScrollModifier: "alt" } as Partial<ITerminalOptions>),
        theme: (() => {
          const root = document.documentElement;
          const cs = getComputedStyle(root);
          return {
            background: cs.getPropertyValue(TOKENS.TERM_BG).trim() || "#1e1e1e",
            foreground: cs.getPropertyValue(TOKENS.TERM_FG).trim() || "#cccccc",
            cursor: cs.getPropertyValue(TOKENS.TERM_CURSOR).trim() || "#cccccc",
            selectionBackground: cs.getPropertyValue(TOKENS.TERM_SELECTION).trim() || "#264f78",
          };
        })(),
      });

      // Allow host-level keyboard shortcuts (Cmd+N, Cmd+W, etc.) to reach the
      // app even when the terminal is focused. Only keydown is considered for
      // passthrough; keyup/keypress are left to xterm entirely.
      terminal.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        return !matchesAnyShortcut(e, TERMINAL_PASSTHROUGH_SHORTCUTS);
      });

      const rawOpts = (terminal as any)._core?.optionsService?.rawOptions;
      if (rawOpts && !rawOpts.allowProposedApi) {
        rawOpts.allowProposedApi = true;
      }

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Unicode 11 width tables (correct emoji/CJK cell widths, as VSCode does)
      // and clickable web links. These are per-terminal and created once here —
      // independent of the GPU renderer lifecycle.
      const unicode11Addon = new Unicode11Addon();
      terminal.loadAddon(unicode11Addon);
      terminal.unicode.activeVersion = "11";
      terminal.loadAddon(new WebLinksAddon());

      // NOTE: no WebglAddon is created here. The bounded renderer pool attaches
      // one on reveal (useTerminalReveal -> requestWebgl) only when there's a
      // free GPU context slot, and detaches it on hide/dispose. Until then the
      // terminal renders via xterm's built-in DOM renderer, which can never
      // exhaust WebGL contexts. See ./webglPool for the full rationale.

      terminal.onData((data) => {
        const c = manager.getTerminal(cacheKey);
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
      manager.setTerminal(cacheKey, { terminal, fitAddon, ptyId: null, opened: false, ackBytes: 0 });

      // Open immediately only if the container is currently visible.
      // If hidden (display:none on ancestor), defer to first reveal via useTerminalReveal.
      if (container.offsetParent !== null) {
        ensureOpened(cacheKey, container, manager);
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
      const last = manager.getTerminal(cacheKey);
      if (last?.terminal.element && last.terminal.element.parentNode === container) {
        container.removeChild(last.terminal.element);
      }
    };
  }, [cacheKey, manager]);
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

/**
 * Build the Channel writer for a cached terminal's PTY output. Writes each raw
 * chunk to xterm and, via xterm's parse-completion callback, drives ACK-based
 * flow control: it accumulates parsed bytes on the shared `cached.ackBytes` and
 * credits them back to the backend (pty_ack) once they cross ACK_FLUSH_BYTES.
 *
 * The ack fires from the parse callback, which runs even for hidden/backgrounded
 * terminals — so a backgrounded process never stalls waiting on an ack that
 * visibility would otherwise gate. The accumulator lives on the shared `cached`
 * object so the spawn and restart paths share one counter.
 */
function makeOnBytes(cached: CachedTerminal): (bytes: ArrayBuffer) => void {
  return (bytes) => {
    const arr = new Uint8Array(bytes);
    cached.terminal.write(arr, () => {
      cached.ackBytes += arr.byteLength;
      if (cached.ackBytes >= ACK_FLUSH_BYTES && cached.ptyId) {
        const n = cached.ackBytes;
        cached.ackBytes = 0;
        invoke("pty_ack", { ptyId: cached.ptyId, bytes: n }).catch((err) => {
          if (String(err).includes("PTY not found")) cached.ptyId = null;
        });
      }
    });
  };
}

function usePty(
  cacheKey: string,
  terminalId: string,
  sessionId: string,
  workspaceId: string,
  areaId: string,
  onFocusedAreaChange: (areaId: string) => void,
  onScreenChange: (screen: Screen) => void,
  manager: TerminalCacheManager,
  disposeTerminal: (terminalId: string) => void,
): { isSpawning: boolean; isExited: boolean; restartTerminal: () => void } {
  const [isSpawning, setIsSpawning] = useState(true);
  const [isExited, setIsExited] = useState(false);

  const restartTerminal = useCallback(() => {
    const cached = manager.getTerminal(cacheKey);
    if (!cached) return;
    cached.ptyId = null;
    setIsExited(false);
    setIsSpawning(true);
    spawnPtyWithChannel(terminalId, sessionId, makeOnBytes(cached))
      .then(({ pty_id }) => {
        cached.ptyId = pty_id;
        setIsSpawning(false);
      })
      .catch((err) => {
        cached.terminal.write(`\r\nFailed to spawn terminal: ${err}\r\n`);
        setIsSpawning(false);
      });
  }, [cacheKey, terminalId, sessionId, manager]);

  useEffect(() => {
    const isMounted = { current: true };
    const cached = manager.getTerminal(cacheKey);
    if (!cached) return;

    if (cached.ptyId) {
      setIsSpawning(false);
    } else {
      spawnPtyWithChannel(terminalId, sessionId, makeOnBytes(cached))
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

    manager.setExitCallback(terminalId, () => {
      const c = manager.getTerminal(cacheKey);
      if (!c) return;
      c.ptyId = null;
      if (!isMounted.current) return;

      safeInvoke<{ current_screen: Screen }>("close_area", {
        sessionId,
        workspaceId,
        areaId,
      })
        .then((r) => {
          disposeTerminal(terminalId);
          onScreenChange(r.current_screen);
          const areas = r.current_screen.areas;
          if (areas.length > 0) {
            const firstTerminal = areas.find(a => a.panel_type === "terminal");
            onFocusedAreaChange(firstTerminal?.id ?? areas[0].id);
          }
        })
        .catch(() => {
          setIsExited(true);
          setIsSpawning(false);
        });
    });

    return () => {
      isMounted.current = false;
      manager.deleteExitCallback(terminalId);
    };
  }, [cacheKey, sessionId, workspaceId, areaId, terminalId, onFocusedAreaChange, onScreenChange, manager, disposeTerminal]);

  return { isSpawning, isExited, restartTerminal };
}

function useTerminalDragDrop(cacheKey: string, manager: TerminalCacheManager): void {
  const { areaId } = usePanelIdentity();
  const { focusedAreaId } = usePanelFocus();
  const focusedAreaIdRef = useRef(focusedAreaId);
  focusedAreaIdRef.current = focusedAreaId;
  const areaIdRef = useRef(areaId);
  areaIdRef.current = areaId;

  useEffect(() => {
    const cached = manager.getTerminal(cacheKey);
    if (!cached) return;

    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      const c = manager.getTerminal(cacheKey);
      if (!c || !c.ptyId) return;
      if (event.payload.type === "drop" && event.payload.paths.length > 0) {
        if (focusedAreaIdRef.current !== areaIdRef.current) return;
        for (const p of event.payload.paths) {
          invoke("pty_write", { ptyId: c.ptyId, data: p + " " });
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [cacheKey, manager]);
}

function useTerminalResize(
  containerRef: RefObject<HTMLDivElement | null>,
  cacheKey: string,
  manager: TerminalCacheManager,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Debounce so a window/pane drag doesn't fire a fit + pty_resize on every
    // pixel tick, and only round-trip to the backend when the cell grid actually
    // changes (VSCode debounces resize the same way).
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCols = -1;
    let lastRows = -1;

    const applyResize = () => {
      const c = manager.getTerminal(cacheKey);
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
        if (cols === lastCols && rows === lastRows) return;
        lastCols = cols;
        lastRows = rows;
        invoke("pty_resize", { ptyId: c.ptyId, cols, rows }).catch((err) => {
          if (String(err).includes("PTY not found")) {
            c.ptyId = null;
          }
        });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyResize, 100);
    });
    resizeObserver.observe(container);

    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      resizeObserver.disconnect();
    };
  }, [cacheKey, manager]);
}

function useTerminalReveal(
  containerRef: RefObject<HTMLDivElement | null>,
  cacheKey: string,
  areaId: string,
  focusedAreaId: string | null,
  manager: TerminalCacheManager,
  webglPool: ReturnType<typeof useWebGLPool>,
): void {
  const focusedAreaIdRef = useRef(focusedAreaId);
  focusedAreaIdRef.current = focusedAreaId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          // Lazy-open: open a deferred terminal on first reveal.
          ensureOpened(cacheKey, container, manager);
          // Request a WebGL renderer now that the terminal is visible AND
          // opened (terminal.element exists). The pool caps concurrent contexts
          // and gracefully no-ops onto the DOM renderer if no slot is free.
          // ensureOpened MUST run first so the addon has a mounted element.
          const revealed = manager.getTerminal(cacheKey);
          if (revealed) webglPool.requestWebgl(cacheKey, revealed.terminal);
          // After the pane has laid out post-reveal, fit the terminal to the
          // settled container size and focus it. Only focus if this panel is
          // currently the focused one — otherwise a layout reflow (e.g. after
          // closing a panel) triggers this observer on every surviving panel
          // and steals DOM focus from the panel that was just focused.
          setTimeout(() => {
            if (focusedAreaIdRef.current !== areaId) return;
            const c = manager.getTerminal(cacheKey);
            if (!c) return;
            c.fitAddon.fit();
            c.terminal.focus();
          }, 300);
        } else {
          // Hidden: mark not-visible (frees this terminal's context for eviction
          // by a newly-revealed one) and schedule idle reaping of its WebGL
          // addon after the grace period. The Terminal instance stays cached.
          webglPool.releaseWebgl(cacheKey);
        }
      },
      { threshold: 0 },
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [cacheKey, areaId, manager, webglPool]);
}

function TerminalPanel({ panelType: _panelType }: PanelProps) {
  const { workspaceId: _workspaceId, sessionId, areaId: _areaId, terminalId: contextTerminalId } = usePanelIdentity();
  const { focusedAreaId, onFocusedAreaChange, onScreenChange } = usePanelFocus();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef(contextTerminalId ?? crypto.randomUUID());
  const terminalId = terminalIdRef.current;
  const cacheKey = terminalId;

  const { manager: terminalManager, disposeTerminal } = useTerminalCache();
  const webglPool = useWebGLPool();

  useXtermTerminal(containerRef, cacheKey, terminalManager);
  const { isSpawning, isExited, restartTerminal } = usePty(cacheKey, terminalId, sessionId, _workspaceId, _areaId, onFocusedAreaChange, onScreenChange, terminalManager, disposeTerminal);
  useTerminalDragDrop(cacheKey, terminalManager);
  useTerminalResize(containerRef, cacheKey, terminalManager);
  useTerminalReveal(containerRef, cacheKey, _areaId, focusedAreaId, terminalManager, webglPool);

  useEffect(() => {
    if (focusedAreaId === _areaId) {
      const c = terminalManager.getTerminal(cacheKey);
      if (c?.terminal) {
        c.terminal.focus();
      }
    }
  }, [focusedAreaId, _areaId, cacheKey, terminalManager]);

  return (
    <div style={{ position: "relative", width: "100%", flex: 1, minHeight: 0 }}>
      <div
        ref={containerRef}
        className="terminal-container"
        style={{ width: "100%", height: "100%" }}
        onClick={() => {
          const c = terminalManager.getTerminal(cacheKey);
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
            color: "var(--text-muted)",
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
            color: "var(--text-muted)",
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
