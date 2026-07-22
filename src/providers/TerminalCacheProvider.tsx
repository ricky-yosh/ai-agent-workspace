/**
 * Terminal cache + PTY exit callbacks — React context provider.
 *
 * Owns the `terminalCache`, `ptyExitCallbacks`, and the global PTY-exit
 * listener registration.  Provides a stable API via context so consumers
 * (TerminalPanel, ScreenRenderer, App) can swap implementations in tests.
 */

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { requestWebgl, disposeWebgl } from "../webglPool";

// ---------------------------------------------------------------------------
// CachedTerminal type (mirrors TerminalPanel's definition)
// ---------------------------------------------------------------------------

export interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  ptyId: string | null;
  opened: boolean;
  ackBytes: number;
}

// ---------------------------------------------------------------------------
// TerminalCacheManager class
// ---------------------------------------------------------------------------

export class TerminalCacheManager {
  private map = new Map<string, CachedTerminal>();
  private exitCallbacks = new Map<string, () => void>();
  private globalListenersInitialized = false;

  getTerminal(key: string): CachedTerminal | undefined {
    return this.map.get(key);
  }

  setTerminal(key: string, value: CachedTerminal): void {
    this.map.set(key, value);
  }

  disposeTerminal(terminalId: string): void {
    const cached = this.map.get(terminalId);
    if (!cached) return;

    // Free the GPU/WebGL context first
    const dyingTerminal = cached.terminal;
    if (dyingTerminal) releaseDocumentMouseListeners(dyingTerminal);
    disposeWebgl(terminalId);

    cached.terminal.dispose();
    this.map.delete(terminalId);
    this.exitCallbacks.delete(terminalId);

    invoke("pty_kill", { terminalId }).catch(() => {});
  }

  setExitCallback(terminalId: string, cb: () => void): void {
    this.exitCallbacks.set(terminalId, cb);
  }

  deleteExitCallback(terminalId: string): void {
    this.exitCallbacks.delete(terminalId);
  }

  /**
   * Lazily register the global pty-exit event listener (once).
   * Moved here from TerminalPanel's module-level side effect so it lives
   * inside the provider's lifecycle.
   */
  ensureGlobalListeners(): void {
    if (this.globalListenersInitialized) return;
    this.globalListenersInitialized = true;
    const callbacks = this.exitCallbacks;
    listen<{ terminal_id: string }>("pty-exit", (event) => {
      callbacks.get(event.payload.terminal_id)?.();
    });
  }
}

// ---------------------------------------------------------------------------
// Helper — same as TerminalPanel's releaseDocumentMouseListeners
// ---------------------------------------------------------------------------

function releaseDocumentMouseListeners(terminal: Terminal): void {
  try {
    const cms = (terminal as unknown as {
      _core?: { coreMouseService?: { activeProtocol: string } };
    })._core?.coreMouseService;
    if (cms && cms.activeProtocol !== "NONE") cms.activeProtocol = "NONE";
  } catch {
    // Private API moved/renamed — nothing safe to do.
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TerminalCacheContextValue {
  manager: TerminalCacheManager;
}

const TerminalCacheContext = createContext<TerminalCacheContextValue | null>(null);

/**
 * Provider that creates a single TerminalCacheManager instance (via useRef)
 * and registers the global pty-exit listener via useEffect.
 */
export function TerminalCacheProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<TerminalCacheManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = new TerminalCacheManager();
  }

  // Register global listeners on mount (replaces module-level ensureGlobalListeners)
  useEffect(() => {
    managerRef.current!.ensureGlobalListeners();
  }, []);

  return (
    <TerminalCacheContext.Provider value={{ manager: managerRef.current }}>
      {children}
    </TerminalCacheContext.Provider>
  );
}

/**
 * Hook that returns a stable API wrapping the TerminalCacheManager.
 *
 * `disposeTerminal` is wrapped in useCallback so its reference is stable
 * across renders — safe to pass to event handlers and non-React callers.
 */
export function useTerminalCache() {
  const ctx = useContext(TerminalCacheContext);
  if (!ctx) {
    throw new Error("useTerminalCache must be used within a <TerminalCacheProvider>");
  }
  const { manager } = ctx;

  const disposeTerminal = useCallback(
    (terminalId: string) => manager.disposeTerminal(terminalId),
    [manager],
  );

  return {
    manager,
    disposeTerminal,
    getTerminal: useCallback(
      (key: string) => manager.getTerminal(key),
      [manager],
    ),
    setTerminal: useCallback(
      (key: string, value: CachedTerminal) => manager.setTerminal(key, value),
      [manager],
    ),
    setExitCallback: useCallback(
      (terminalId: string, cb: () => void) => manager.setExitCallback(terminalId, cb),
      [manager],
    ),
    deleteExitCallback: useCallback(
      (terminalId: string) => manager.deleteExitCallback(terminalId),
      [manager],
    ),
    // Re-export WebGL helpers for convenience so TerminalPanel doesn't need
    // a separate import.
    requestWebgl,
    disposeWebgl,
  };
}
