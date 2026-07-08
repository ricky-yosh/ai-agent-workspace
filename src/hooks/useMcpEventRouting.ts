import { useCallback, useRef } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { safeInvoke } from "../safeInvoke";
import type { WorkspaceInstance } from "./useWorkspaceManager";
import { useViewerRegistry } from "../providers/ViewerRegistryProvider";
import type { Screen } from "../types/screen";

export function useMcpEventRouting(params: {
  sessionId: string | null;
  workspaceId: string;
  screen: Screen | null;
  focusedAreaIdRef: React.RefObject<string | null>;
  onError: (msg: string) => void;
  handleScreenChange: (workspaceId: string, screen: Screen) => void;
  setFocusedAreaId: (id: string | null) => void;
}) {
  const { sessionId, workspaceId, screen, focusedAreaIdRef, onError, handleScreenChange, setFocusedAreaId } = params;
  const registry = useViewerRegistry();

  const panelContextRef = useRef<{
    screen: Screen | null;
    workspaceId: string;
    sessionId: string;
  }>({ screen: null, workspaceId: '', sessionId: '' });

  panelContextRef.current = { screen, workspaceId, sessionId: sessionId ?? '' };

  // --- MCP Integration: open-file-request ---
  // When an AI agent calls the open_file MCP tool, the backend emits this event.
  // Route the file open to the last-focused File Viewer panel, or create one if none exists.
  useTauriEvent<{ session_id: string; file_path: string }>(
    "open-file-request",
    useCallback((payload) => {
      const { session_id, file_path } = payload;
      const ctx = panelContextRef.current;
      if (!ctx.sessionId || session_id !== ctx.sessionId) return;

      const viewer = registry.getLastFocusedViewer(ctx.workspaceId);
      if (viewer) {
        // Focus the viewer's area and open the file
        setFocusedAreaId(viewer.areaId);
        viewer.openFile(file_path);
      } else {
        // No file viewer exists — create one by splitting the focused area
        const focusedId = focusedAreaIdRef.current;
        if (!focusedId || !ctx.workspaceId || !ctx.screen) return;

        const oldAreaIds = new Set(ctx.screen.areas.map(a => a.id));
        safeInvoke<WorkspaceInstance>("split_area", {
          sessionId: ctx.sessionId,
          workspaceId: ctx.workspaceId,
          areaId: focusedId,
          axis: "vertical",
          factor: 0.6,
        }, onError)
          .then(r => {
            handleScreenChange(ctx.workspaceId, r.current_screen);
            const newArea = r.current_screen.areas.find(a => !oldAreaIds.has(a.id));
            if (!newArea) return;
            return safeInvoke<WorkspaceInstance>("change_panel_type", {
              sessionId: ctx.sessionId,
              workspaceId: ctx.workspaceId,
              areaId: newArea.id,
              panelType: "file-viewer",
            }, onError).then(r2 => {
              handleScreenChange(ctx.workspaceId, r2.current_screen);
              setFocusedAreaId(newArea.id);
              registry.setPendingFile(file_path);
            });
          })
          .catch(console.error);
      }
    }, [registry, onError, handleScreenChange]),
  );

  // --- MCP Integration: show-diff-request ---
  // When an AI agent calls the show_diff MCP tool, the backend emits this event.
  // Route to the Diff Viewer panel, or create one if none exists.
  useTauriEvent<{ session_id: string; file_path?: string; staged?: boolean }>(
    "show-diff-request",
    useCallback((payload) => {
      const { session_id, file_path, staged } = payload;
      const ctx = panelContextRef.current;
      if (!ctx.sessionId || session_id !== ctx.sessionId) return;

      if (registry.hasDiffViewer()) {
        // A diff viewer is mounted — deliver the command directly
        registry.requestShowDiff(file_path, staged);
      } else {
        // No diff viewer exists — create one by splitting the focused area
        const focusedId = focusedAreaIdRef.current;
        if (!focusedId || !ctx.workspaceId || !ctx.screen) return;

        const oldAreaIds = new Set(ctx.screen.areas.map(a => a.id));
        safeInvoke<WorkspaceInstance>("split_area", {
          sessionId: ctx.sessionId,
          workspaceId: ctx.workspaceId,
          areaId: focusedId,
          axis: "vertical",
          factor: 0.6,
        }, onError)
          .then(r => {
            handleScreenChange(ctx.workspaceId, r.current_screen);
            const newArea = r.current_screen.areas.find(a => !oldAreaIds.has(a.id));
            if (!newArea) return;
            return safeInvoke<WorkspaceInstance>("change_panel_type", {
              sessionId: ctx.sessionId,
              workspaceId: ctx.workspaceId,
              areaId: newArea.id,
              panelType: "diff-viewer",
            }, onError).then(r2 => {
              handleScreenChange(ctx.workspaceId, r2.current_screen);
              setFocusedAreaId(newArea.id);
              // The DiffViewerPanel will mount and register its handler,
              // then pick up the pending show-diff action.
              registry.requestShowDiff(file_path, staged);
            });
          })
          .catch(console.error);
      }
    }, [registry, onError, handleScreenChange]),
  );
}
