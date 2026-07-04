/**
 * Diff Viewer Action Bridge — thin re-export.
 *
 * Backed by a default PanelActionBridge instance.
 * Prefer using usePanelActionBridge() hook in React components.
 */

import { PanelActionBridge } from "./providers/PanelActionBridgeProvider";

const defaultBridge = new PanelActionBridge();

export type { ShowDiffPayload } from "./providers/PanelActionBridgeProvider";

export function registerShowDiffHandler(handler: (payload: { filePath?: string; staged?: boolean }) => void): () => void {
  return defaultBridge.registerShowDiffHandler(handler);
}

export function requestShowDiff(filePath?: string, staged?: boolean): void {
  defaultBridge.requestShowDiff(filePath, staged);
}

export function hasDiffViewerHandler(): boolean {
  return defaultBridge.hasDiffViewerHandler();
}
