import { useRef, useEffect, useState } from "react";
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
}

const terminalCache = new Map<string, CachedTerminal>();

function disposeTerminalCacheEntry(workspaceId: string, path: number[]) {
  const key = `${workspaceId}::${JSON.stringify(path)}`;
  const cached = terminalCache.get(key);
  if (cached) {
    cached.terminal.dispose();
    terminalCache.delete(key);
  }
}

function TerminalPanel({ panelType: _panelType }: PanelProps) {
  const { workspaceId, sessionId, path } = usePanelContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const isMountedRef = useRef(true);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const cacheKey = `${workspaceId}::${JSON.stringify(path)}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    isMountedRef.current = true;
    let cached = terminalCache.get(cacheKey);
    let terminal: Terminal;
    let fitAddon: FitAddon;

    if (cached) {
      ({ terminal, fitAddon } = cached);
      if (terminal.element) {
        container.appendChild(terminal.element);
      }
      requestAnimationFrame(() => {
        if (isMountedRef.current && fitAddon) {
          fitAddon.fit();
          terminal.focus();
        }
      });
      if (cached.ptyId) {
        setShowOverlay(false);
      }
    } else {
      terminal = new Terminal({
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

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);

      requestAnimationFrame(() => {
        if (isMountedRef.current && fitAddon) {
          fitAddon.fit();
          terminal.focus();
        }
      });

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

      cached = { terminal, fitAddon, ptyId: null };
      terminalCache.set(cacheKey, cached);

      invoke<{ pty_id: string }>("pty_spawn", {
        workspaceId,
        path,
        sessionId,
      }).then(({ pty_id }) => {
        if (!isMountedRef.current) return;
        cached!.ptyId = pty_id;
        setShowOverlay(false);
      }).catch((err) => {
        if (!isMountedRef.current) return;
        terminal.write(`\r\nFailed to spawn terminal: ${err}\r\n`);
        setShowOverlay(false);
      });
    }

    let disposed = false;

    const unsubOutput = listen<{ pty_id: string; data: number[] }>("pty-output", (event) => {
      if (disposed) return;
      if (event.payload.pty_id === cached!.ptyId) {
        terminal.write(new Uint8Array(event.payload.data));
      }
    });
    unsubscribersRef.current.push(() => {
      disposed = true;
      unsubOutput.then((fn) => fn());
    });

    const unsubRestart = listen<{ old_pty_id: string; new_pty_id: string; path: number[] }>(
      "pty-restart",
      (event) => {
        if (disposed) return;
        if (event.payload.old_pty_id === cached!.ptyId) {
          terminal.write("\r\nProcess exited. Restarting…\r\n");
          cached!.ptyId = event.payload.new_pty_id;
        }
      },
    );
    unsubscribersRef.current.push(() => {
      disposed = true;
      unsubRestart.then((fn) => fn());
    });

    const webview = getCurrentWebviewWindow();
    const unlistenDragDrop = webview.onDragDropEvent((event) => {
      if (disposed) return;
      if (event.payload.type === "drop" && event.payload.paths.length > 0 && cached!.ptyId) {
        const paths = event.payload.paths;
        for (const p of paths) {
          invoke("pty_write", { ptyId: cached!.ptyId, data: p + " " });
        }
      }
    });
    unsubscribersRef.current.push(() => {
      disposed = true;
      unlistenDragDrop.then((fn) => fn());
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon) {
        fitAddon.fit();
        const { cols, rows } = terminal;
        if (cached!.ptyId) {
          invoke("pty_resize", { ptyId: cached!.ptyId, cols, rows }).catch((err) => {
            if (String(err).includes("PTY not found")) {
              cached!.ptyId = null;
            }
          });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      isMountedRef.current = false;
      resizeObserver.disconnect();
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
      disposeTerminalCacheEntry(workspaceId, path);
      if (terminal.element && terminal.element.parentNode === container) {
        container.removeChild(terminal.element);
      }
    };
  }, [cacheKey, sessionId]);

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
      {showOverlay && (
        <div style={{
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
        }}>
          Connecting…
        </div>
      )}
    </div>
  );
}

registerPanel("terminal", "Terminal", TerminalPanel);

export default TerminalPanel;
