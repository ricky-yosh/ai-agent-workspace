/**
 * Diff Viewer Action Bridge — thin re-export.
 *
 * Backed by a default ViewerRegistry instance.
 * Prefer using useViewerRegistry() hook in React components.
 */

import { ViewerRegistry } from "./providers/ViewerRegistryProvider";

const defaultRegistry = new ViewerRegistry();

export type { ShowDiffPayload } from "./providers/ViewerRegistryProvider";

export function registerShowDiffHandler(handler: (payload: { filePath?: string; staged?: boolean }) => void): () => void {
  return defaultRegistry.registerShowDiffHandler(handler);
}

export function requestShowDiff(filePath?: string, staged?: boolean): void {
  defaultRegistry.requestShowDiff(filePath, staged);
}

export function hasDiffViewerHandler(): boolean {
  return defaultRegistry.hasDiffViewer();
}
