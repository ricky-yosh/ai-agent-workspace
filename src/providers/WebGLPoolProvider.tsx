/**
 * WebGL pool thin wrapper — React context provider.
 *
 * The actual webglPool module stays as-is (module singleton with timers — too
 * fragile to recreate).  This provider wraps it with a context that exposes
 * the three public functions so tests can swap the implementation.
 */

import { createContext, useContext, useRef, type ReactNode } from "react";
import {
  requestWebgl as _requestWebgl,
  releaseWebgl as _releaseWebgl,
  disposeWebgl as _disposeWebgl,
} from "../webglPool";
import type { Terminal } from "@xterm/xterm";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface WebGLPoolAPI {
  requestWebgl(terminalId: string, terminal: Terminal): void;
  releaseWebgl(terminalId: string): void;
  disposeWebgl(terminalId: string): void;
}

// ---------------------------------------------------------------------------
// Default implementation — delegates to the module singleton
// ---------------------------------------------------------------------------

const defaultPool: WebGLPoolAPI = {
  requestWebgl: _requestWebgl,
  releaseWebgl: _releaseWebgl,
  disposeWebgl: _disposeWebgl,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WebGLPoolContext = createContext<WebGLPoolAPI>(defaultPool);

/**
 * Provider that wraps the module singleton webglPool behind a context.
 * The value is stable across re-renders (held in a ref).
 */
export function WebGLPoolProvider({ children }: { children: ReactNode }) {
  const ref = useRef<WebGLPoolAPI>(defaultPool);
  return (
    <WebGLPoolContext.Provider value={ref.current}>
      {children}
    </WebGLPoolContext.Provider>
  );
}

/**
 * Hook that returns the WebGLPool API from context.
 */
export function useWebGLPool(): WebGLPoolAPI {
  return useContext(WebGLPoolContext);
}
