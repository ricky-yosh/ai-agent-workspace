/**
 * Diff Viewer Action Bridge
 *
 * Allows Tauri event handlers (MainArea) to deliver show-diff commands to the
 * DiffViewerPanel. The panel registers a handler on mount; MainArea calls
 * requestShowDiff when the Tauri event arrives.
 */

// ---------------------------------------------------------------------------
// Show Diff
// ---------------------------------------------------------------------------

export interface ShowDiffPayload {
  filePath?: string;
  staged?: boolean;
}

type ShowDiffHandler = (payload: ShowDiffPayload) => void;

let showDiffHandler: ShowDiffHandler | null = null;
let pendingShowDiff: ShowDiffPayload | null = null;

/**
 * Register a handler for show-diff actions (called by DiffViewerPanel on mount).
 * Returns an unsubscribe function.
 */
export function registerShowDiffHandler(handler: ShowDiffHandler): () => void {
  showDiffHandler = handler;

  // Deliver any pending action
  if (pendingShowDiff !== null) {
    const payload = pendingShowDiff;
    pendingShowDiff = null;
    queueMicrotask(() => handler(payload));
  }

  return () => {
    if (showDiffHandler === handler) {
      showDiffHandler = null;
    }
  };
}

/**
 * Request that a diff be shown. Delivers immediately if a handler is
 * registered, otherwise stores the action as pending.
 */
export function requestShowDiff(filePath?: string, staged?: boolean): void {
  if (showDiffHandler) {
    showDiffHandler({ filePath, staged });
  } else {
    pendingShowDiff = { filePath, staged };
  }
}

/**
 * Check if a diff viewer panel is currently mounted.
 */
export function hasDiffViewerHandler(): boolean {
  return showDiffHandler !== null;
}
