/**
 * Cross-panel communication registry for File Viewer tracking.
 *
 * Provides a class-based ViewerRegistry behind a React context so tests can
 * swap implementations.  The class mirrors the original module-level API from
 * viewerRegistry.ts.
 */

import { createContext, useContext, useRef, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types (mirrors the originals in viewerRegistry.ts)
// ---------------------------------------------------------------------------

type OpenFileFn = (filePath: string) => void;

export interface ShowDiffPayload {
  filePath?: string;
  staged?: boolean;
}

export interface ViewerInfo {
  areaId: string;
  openFile: OpenFileFn;
  workspaceId: string;
  contentType: string;
}

// ---------------------------------------------------------------------------
// ViewerRegistry class — ownable, testable instance
// ---------------------------------------------------------------------------

export class ViewerRegistry {
  private viewerMap = new Map<string, ViewerInfo>();
  private lastFocusedViewer: ViewerInfo | null = null;
  private pendingFilePath: string | null = null;
  private activeFilePath: string | null = null;
  private activeFilePathListeners: Array<() => void> = [];

  // --- Registration ---

  registerViewer(areaId: string, openFile: OpenFileFn, workspaceId: string, contentType: string): void {
    const info: ViewerInfo = { areaId, openFile, workspaceId, contentType };
    this.viewerMap.set(areaId, info);
    this.lastFocusedViewer = info;
  }

  unregisterViewer(areaId: string): void {
    this.viewerMap.delete(areaId);
    if (this.lastFocusedViewer?.areaId === areaId) {
      this.lastFocusedViewer = null;
      for (const info of this.viewerMap.values()) {
        this.lastFocusedViewer = info;
        break;
      }
    }
  }

  focusViewer(areaId: string): void {
    const info = this.viewerMap.get(areaId);
    if (info) {
      this.lastFocusedViewer = info;
    }
  }

  // --- Queries ---

  getLastFocusedViewer(workspaceId?: string): ViewerInfo | null {
    return this.getLastFocusedViewerByType("file", workspaceId);
  }

  getLastFocusedViewerByType(contentType: string, workspaceId?: string): ViewerInfo | null {
    if (this.lastFocusedViewer?.contentType === contentType) {
      if (!workspaceId || this.lastFocusedViewer.workspaceId === workspaceId) {
        return this.lastFocusedViewer;
      }
    }
    for (const info of this.viewerMap.values()) {
      if (info.contentType === contentType) {
        if (!workspaceId || info.workspaceId === workspaceId) return info;
      }
    }
    return null;
  }

  // --- File opening ---

  openFileInViewer(filePath: string): void {
    window.dispatchEvent(
      new CustomEvent("viewer:open-file", { detail: { filePath } }),
    );
  }

  // --- Pending file ---

  setPendingFile(filePath: string): void {
    this.pendingFilePath = filePath;
  }

  consumePendingFile(): string | null {
    const p = this.pendingFilePath;
    this.pendingFilePath = null;
    return p;
  }

  // --- Active file tracking ---

  setActiveFilePath(filePath: string | null): void {
    if (this.activeFilePath === filePath) return;
    this.activeFilePath = filePath;
    for (const fn of this.activeFilePathListeners) fn();
  }

  getActiveFilePath(): string | null {
    return this.activeFilePath;
  }

  onActiveFilePathChange(listener: () => void): () => void {
    this.activeFilePathListeners.push(listener);
    return () => {
      this.activeFilePathListeners = this.activeFilePathListeners.filter(
        (fn) => fn !== listener,
      );
    };
  }

  // --- Diff viewer dispatch ---

  private showDiffHandler: ((payload: ShowDiffPayload) => void) | null = null;
  private pendingShowDiff: ShowDiffPayload | null = null;

  registerShowDiffHandler(handler: (payload: ShowDiffPayload) => void): () => void {
    this.showDiffHandler = handler;
    if (this.pendingShowDiff) {
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

  hasDiffViewer(): boolean {
    return this.showDiffHandler !== null;
  }

  // --- Diff content dispatch (for commit diffs, range diffs, etc.) ---

  dispatchDiffContent(content: string, title: string): void {
    window.dispatchEvent(
      new CustomEvent("viewer:open-diff-content", { detail: { content, title } }),
    );
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ViewerRegistryContext = createContext<ViewerRegistry | null>(null);

/**
 * Provider that creates a single ViewerRegistry instance and makes it
 * available via context.  The instance is stable across re-renders (held
 * in a ref).
 */
export function ViewerRegistryProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ViewerRegistry | null>(null);
  if (ref.current === null) {
    ref.current = new ViewerRegistry();
  }
  return (
    <ViewerRegistryContext.Provider value={ref.current}>
      {children}
    </ViewerRegistryContext.Provider>
  );
}

/**
 * Hook that returns the ViewerRegistry instance from context.
 * Throws if used outside a <ViewerRegistryProvider>.
 */
export function useViewerRegistry(): ViewerRegistry {
  const ctx = useContext(ViewerRegistryContext);
  if (!ctx) {
    throw new Error("useViewerRegistry must be used within a <ViewerRegistryProvider>");
  }
  return ctx;
}
