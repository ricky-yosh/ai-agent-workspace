/**
 * Cross-panel communication registry for File Viewer tracking.
 *
 * Thin re-export backed by a default ViewerRegistry instance.
 * Prefer using useViewerRegistry() hook in React components.
 */

import { ViewerRegistry } from "../providers/ViewerRegistryProvider";

const defaultRegistry = new ViewerRegistry();

export type { ViewerInfo } from "../providers/ViewerRegistryProvider";

export function registerViewer(
  areaId: string,
  openFile: (filePath: string) => void,
  workspaceId: string,
  contentType: string,
): void {
  defaultRegistry.registerViewer(areaId, openFile, workspaceId, contentType);
}

export function unregisterViewer(areaId: string): void {
  defaultRegistry.unregisterViewer(areaId);
}

export function focusViewer(areaId: string): void {
  defaultRegistry.focusViewer(areaId);
}

export function getLastFocusedViewer(workspaceId?: string) {
  return defaultRegistry.getLastFocusedViewer(workspaceId);
}

export function openFileInViewer(filePath: string): void {
  defaultRegistry.openFileInViewer(filePath);
}

export function setPendingFile(filePath: string): void {
  defaultRegistry.setPendingFile(filePath);
}

export function consumePendingFile(): string | null {
  return defaultRegistry.consumePendingFile();
}

export function setActiveFilePath(filePath: string | null): void {
  defaultRegistry.setActiveFilePath(filePath);
}

export function getActiveFilePath(): string | null {
  return defaultRegistry.getActiveFilePath();
}

export function onActiveFilePathChange(listener: () => void): () => void {
  return defaultRegistry.onActiveFilePathChange(listener);
}
