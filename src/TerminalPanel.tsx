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

function TerminalPanel({ panelType: _panelType }: PanelProps) {
  const { workspaceId, sessionId, path } = usePanelContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    terminalRef.current?.dispose();
    container.innerHTML = "";

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

    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    terminal.open(container);

    requestAnimationFrame(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });

    invoke<{ pty_id: string }>("pty_spawn", {
      workspaceId,
      path,
      sessionId,
    }).then(({ pty_id }) => {
      ptyIdRef.current = pty_id;
      setShowOverlay(false);
    }).catch((err) => {
      terminal.write(`\r\nFailed to spawn terminal: ${err}\r\n`);
      setShowOverlay(false);
    });

    const unsubOutput = listen<{ pty_id: string; data: number[] }>("pty-output", (event) => {
      if (event.payload.pty_id === ptyIdRef.current) {
        terminal.write(new Uint8Array(event.payload.data));
      }
    });
    unsubscribersRef.current.push(() => { unsubOutput.then((fn) => fn()); });

    const unsubRestart = listen<{ old_pty_id: string; new_pty_id: string; path: number[] }>(
      "pty-restart",
      (event) => {
        if (event.payload.old_pty_id === ptyIdRef.current) {
          terminal.write("\r\nProcess exited. Restarting…\r\n");
          ptyIdRef.current = event.payload.new_pty_id;
        }
      },
    );
    unsubscribersRef.current.push(() => { unsubRestart.then((fn) => fn()); });

    terminal.onData((data) => {
      if (ptyIdRef.current) {
        invoke("pty_write", { ptyId: ptyIdRef.current, data });
      }
    });

    const webview = getCurrentWebviewWindow();
    const unlistenDragDrop = webview.onDragDropEvent((event) => {
      if (event.payload.type === "drop" && event.payload.paths.length > 0 && ptyIdRef.current) {
        const paths = event.payload.paths;
        for (const path of paths) {
          invoke("pty_write", { ptyId: ptyIdRef.current, data: path + " " });
        }
      }
    });
    unsubscribersRef.current.push(() => { unlistenDragDrop.then((fn) => fn()); });

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminal;
        if (ptyIdRef.current) {
          invoke("pty_resize", { ptyId: ptyIdRef.current, cols, rows });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      unsubscribersRef.current.forEach((unsub) => unsub());
      unsubscribersRef.current = [];
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#1e1e1e" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
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
