/**
 * Cross-panel communication registry for File Viewer tracking.
 *
 * Allows the File Tree panel to open files in the most recently focused
 * File Viewer panel, and highlights the currently active file in the tree.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OpenFileFn = (filePath: string) => void;

interface ViewerInfo {
  areaId: string;
  openFile: OpenFileFn;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const viewerMap = new Map<string, ViewerInfo>();
let lastFocusedViewer: ViewerInfo | null = null;
let pendingFilePath: string | null = null;

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerViewer(
  areaId: string,
  openFile: OpenFileFn,
  workspaceId: string,
): void {
  const info: ViewerInfo = { areaId, openFile, workspaceId };
  viewerMap.set(areaId, info);
  lastFocusedViewer = info;
}

export function unregisterViewer(areaId: string): void {
  viewerMap.delete(areaId);
  if (lastFocusedViewer?.areaId === areaId) {
    // Revert to any remaining viewer in the same workspace, or null
    lastFocusedViewer = null;
    for (const info of viewerMap.values()) {
      lastFocusedViewer = info;
      break;
    }
  }
}

export function focusViewer(areaId: string): void {
  const info = viewerMap.get(areaId);
  if (info) {
    lastFocusedViewer = info;
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function getLastFocusedViewer(workspaceId?: string): ViewerInfo | null {
  if (!workspaceId) return lastFocusedViewer;
  // Prefer the last-focused viewer in this workspace
  if (lastFocusedViewer?.workspaceId === workspaceId) return lastFocusedViewer;
  // Fall back to any viewer in this workspace
  for (const info of viewerMap.values()) {
    if (info.workspaceId === workspaceId) return info;
  }
  return null;
}

// ---------------------------------------------------------------------------
// File opening
// ---------------------------------------------------------------------------

/**
 * Dispatch a custom event that all mounted FileViewerPanel instances listen for.
 * The most recently focused viewer will open the file as a tab.
 */
export function openFileInViewer(filePath: string): void {
  window.dispatchEvent(
    new CustomEvent("viewer:open-file", { detail: { filePath } }),
  );
}

// ---------------------------------------------------------------------------
// Pending file (for create-then-open flow)
// ---------------------------------------------------------------------------

export function setPendingFile(filePath: string): void {
  pendingFilePath = filePath;
}

export function consumePendingFile(): string | null {
  const p = pendingFilePath;
  pendingFilePath = null;
  return p;
}

// ---------------------------------------------------------------------------
// Active file tracking (for tree highlighting)
// ---------------------------------------------------------------------------

let activeFilePath: string | null = null;
let activeFilePathListeners: Array<() => void> = [];

export function setActiveFilePath(filePath: string | null): void {
  if (activeFilePath === filePath) return;
  activeFilePath = filePath;
  for (const fn of activeFilePathListeners) fn();
}

export function getActiveFilePath(): string | null {
  return activeFilePath;
}

export function onActiveFilePathChange(listener: () => void): () => void {
  activeFilePathListeners.push(listener);
  return () => {
    activeFilePathListeners = activeFilePathListeners.filter((fn) => fn !== listener);
  };
}
