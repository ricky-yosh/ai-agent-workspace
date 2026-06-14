import { useRef, useEffect, useState, useCallback, type RefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "@xterm/xterm/css/xterm.css";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelContext } from "./PanelContext";

interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  ptyId: string | null;
  disposeScheduled: boolean;
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
    cached.disposeScheduled = true;
    setTimeout(() => {
      const entry = this.map.get(key);
      if (entry?.disposeScheduled) {
        entry.terminal.dispose();
        this.map.delete(key);
      }
    }, 0);
  }
}

const terminalCache = new TerminalCache();

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
      cached.disposeScheduled = false;
      const { terminal, fitAddon } = cached;
      if (terminal.element) {
        container.appendChild(terminal.element);
      }
      fitAndFocus(terminal, fitAddon, isMounted);
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
      terminal.open(container);

      fitAndFocus(terminal, fitAddon, isMounted);

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

      terminalCache.set(cacheKey, { terminal, fitAddon, ptyId: null, disposeScheduled: false });
    }

    return () => {
      isMounted.current = false;
      const last = terminalCache.get(cacheKey);
      if (last?.terminal.element && last.terminal.element.parentNode === container) {
        container.removeChild(last.terminal.element);
      }
      terminalCache.dispose(cacheKey);
    };
  }, [cacheKey]);
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
    invoke<{ pty_id: string }>("pty_spawn", { terminalId, sessionId })
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
    const unsubs: (() => void)[] = [];

    const cached = terminalCache.get(cacheKey);
    if (!cached) return;

    if (cached.ptyId) {
      setIsSpawning(false);
    } else {
      invoke<{ pty_id: string }>("pty_spawn", { terminalId, sessionId })
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

    const unsubOutput = listen<{ pty_id: string; data: number[] }>(
      "pty-output",
      (event) => {
        const c = terminalCache.get(cacheKey);
        if (!c?.ptyId || !c.terminal.element?.isConnected) return;
        if (event.payload.pty_id === c.ptyId) {
          c.terminal.write(new Uint8Array(event.payload.data));
        }
      },
    );
    unsubs.push(() => {
      unsubOutput.then((fn) => fn()).catch(() => {});
    });

    const unsubExit = listen<{ terminal_id: string }>(
      "pty-exit",
      (event) => {
        if (event.payload.terminal_id !== terminalId) return;
        const c = terminalCache.get(cacheKey);
        if (!c) return;
        c.ptyId = null;
        if (isMounted.current) {
          setIsExited(true);
          setIsSpawning(false);
        }
      },
    );
    unsubs.push(() => {
      unsubExit.then((fn) => fn()).catch(() => {});
    });

    return () => {
      isMounted.current = false;
      unsubs.forEach((fn) => fn());
    };
  }, [cacheKey, sessionId]);

  return { isSpawning, isExited, restartTerminal };
}

function useTerminalDragDrop(cacheKey: string): void {
  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      const c = terminalCache.get(cacheKey);
      if (!c?.ptyId || !c.terminal.element?.isConnected) return;
      if (event.payload.type === "drop" && event.payload.paths.length > 0) {
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
      const { terminal, fitAddon } = c;
      if (!terminal.element?.isConnected) return;
      fitAddon.fit();
      if (c.ptyId) {
        const { cols, rows } = terminal;
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
