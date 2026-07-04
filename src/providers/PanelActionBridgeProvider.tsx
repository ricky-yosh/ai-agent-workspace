/**
 * Diff Viewer Action Bridge — React context provider.
 *
 * Provides a class-based PanelActionBridge behind a React context so tests can
 * swap implementations.  The class mirrors the original module-level API from
 * panelActionBridge.ts.
 */

import { createContext, useContext, useRef, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types (mirrors the originals in panelActionBridge.ts)
// ---------------------------------------------------------------------------

export interface ShowDiffPayload {
  filePath?: string;
  staged?: boolean;
}

type ShowDiffHandler = (payload: ShowDiffPayload) => void;

// ---------------------------------------------------------------------------
// PanelActionBridge class
// ---------------------------------------------------------------------------

export class PanelActionBridge {
  private showDiffHandler: ShowDiffHandler | null = null;
  private pendingShowDiff: ShowDiffPayload | null = null;

  registerShowDiffHandler(handler: ShowDiffHandler): () => void {
    this.showDiffHandler = handler;

    if (this.pendingShowDiff !== null) {
      const payload = this.pendingShowDiff;
      this.pendingShowDiff = null;
      queueMicrotask(() => handler(payload));
    }

    return () => {
      if (this.showDiffHandler === handler) {
        this.showDiffHandler = null;
      }
    };
  }

  requestShowDiff(filePath?: string, staged?: boolean): void {
    if (this.showDiffHandler) {
      this.showDiffHandler({ filePath, staged });
    } else {
      this.pendingShowDiff = { filePath, staged };
    }
  }

  hasDiffViewerHandler(): boolean {
    return this.showDiffHandler !== null;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PanelActionBridgeContext = createContext<PanelActionBridge | null>(null);

/**
 * Provider that creates a single PanelActionBridge instance and makes it
 * available via context.
 */
export function PanelActionBridgeProvider({ children }: { children: ReactNode }) {
  const ref = useRef<PanelActionBridge | null>(null);
  if (ref.current === null) {
    ref.current = new PanelActionBridge();
  }
  return (
    <PanelActionBridgeContext.Provider value={ref.current}>
      {children}
    </PanelActionBridgeContext.Provider>
  );
}

/**
 * Hook that returns the PanelActionBridge instance from context.
 * Throws if used outside a <PanelActionBridgeProvider>.
 */
export function usePanelActionBridge(): PanelActionBridge {
  const ctx = useContext(PanelActionBridgeContext);
  if (!ctx) {
    throw new Error("usePanelActionBridge must be used within a <PanelActionBridgeProvider>");
  }
  return ctx;
}
