import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { safeInvoke } from "./safeInvoke";
import { SessionProvider, useSessions } from "./SessionContext";
import SessionSidebar from "./SessionSidebar";
import ScreenRenderer from "./ScreenRenderer";
import LayoutTabs from "./LayoutTabs";
import NewWorkspaceModal from "./NewWorkspaceModal";
import type { Layout, Screen } from "./types/screen";
import ShortcutsModal from "./ShortcutsModal";
import { ToastProvider, useToast } from "./ToastContext";
import { ToastContainer } from "./Toast";
import StatusBoard from "./StatusBoard";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWorkspaceManager } from "./hooks/useWorkspaceManager";
import { useMcpEventRouting } from "./hooks/useMcpEventRouting";
import { useTauriEvent } from "./hooks/useTauriEvent";
import type { WorkspaceInstance } from "./hooks/useWorkspaceManager";
import { Button, Input } from "./components/ui";
import { Dialog } from "./components/Dialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./GettingStartedPanel";
import "./TerminalPanel";
import "./IssueTrackerPanel";
import "./file-panel/DiffViewerPanel";
import "./file-panel/FileViewerPanel";
import "./file-panel/FileTreePanel";
import "./panels/VisualCanvasPanel";
import "./panels/C4DiagramPanel";
import "./panels/GitTreePanel";
import "./App.css";
import "./Toast.css";
import { getAdjacency } from "./screenLayout";
import type { Adjacency } from "./screenLayout";
import { isMac } from "./utils/platform";
import { TerminalCacheProvider, useTerminalCache } from "./providers/TerminalCacheProvider";
import { WebGLPoolProvider } from "./providers/WebGLPoolProvider";
import { ViewerRegistryProvider } from "./providers/ViewerRegistryProvider";

interface PanelActions {
  navigateFocus: (direction: 'up' | 'down' | 'left' | 'right') => void;
  splitFocused: (axis: 'horizontal' | 'vertical') => void;
  closePanel: () => void;
}

function SaveAsTemplateDialog({
  open,
  onClose,
  onConfirm,
  name,
  setName,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
  setName: (v: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Save as Template">
      <Input
        label="Template name"
        placeholder="Template name..."
        value={name}
        onChange={(v) => setName(v)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
        }}
        style={{ width: "100%", marginBottom: 16 }}
      />
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>Save</Button>
      </div>
    </Dialog>
  );
}

function MainArea({ toggleZoomRef, panelActionsRef, openNewWorkspaceRef, openTabActionsRef, closeTabActionsRef }: { toggleZoomRef: React.RefObject<(() => void) | null>; panelActionsRef: React.RefObject<PanelActions | null>; openNewWorkspaceRef: React.RefObject<(() => void) | null>; openTabActionsRef: React.RefObject<(() => void) | null>; closeTabActionsRef: React.RefObject<(() => void) | null> }) {
  const { activeSessionId, sessions, refreshSessions } = useSessions();
  const { addToast } = useToast();
  const { disposeTerminal } = useTerminalCache();
  const onError = useCallback((msg: string) => addToast({ type: "error", message: msg }), [addToast]);
  const {
    workspaces, activeWorkspace, loading, sessionData,
    handleWorkspaceSwitch, handleScreenChange,
    handleExternalScreenChange,
    handleAddWorkspace, handleCloseWorkspace,
    handleRenameWorkspace, handleResetToTemplate,
    handleCycleWorkspace,
  } = useWorkspaceManager(onError);

  const [templates, setTemplates] = useState<Layout[]>([]);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceInitialEditing, setNewWorkspaceInitialEditing] = useState(false);
  const [saveAsTarget, setSaveAsTarget] = useState<Screen | null>(null);
  const [saveAsName, setSaveAsName] = useState("");
  const [focusedAreaId, setFocusedAreaId] = useState<string | null>(null);
  const focusedAreaIdRef = useRef<string | null>(null);
  const [zoomedAreaId, setZoomedAreaId] = useState<string | null>(null);

  const toggleZoom = useCallback(() => {
    const faId = focusedAreaIdRef.current;
    if (!faId) return;
    setZoomedAreaId((prev) =>
      prev === faId ? null : faId
    );
  }, []);

  useEffect(() => {
    focusedAreaIdRef.current = focusedAreaId;
  }, [focusedAreaId]);

  useEffect(() => {
    toggleZoomRef.current = toggleZoom;
  }, [toggleZoom, toggleZoomRef]);

  useEffect(() => {
    openNewWorkspaceRef.current = () => { setNewWorkspaceInitialEditing(false); setNewWorkspaceOpen(prev => !prev); };
  }, [openNewWorkspaceRef]);

  const panelContextRef = useRef<{
    screen: Screen | null;
    workspaceId: string;
    sessionId: string;
  }>({ screen: null, workspaceId: '', sessionId: '' });

  useEffect(() => {
    panelContextRef.current = {
      screen: activeWorkspace?.current_screen ?? null,
      workspaceId: activeWorkspace?.id ?? '',
      sessionId: activeSessionId ?? '',
    };
  }, [activeWorkspace, activeSessionId]);

  const navigateFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const focusedId = focusedAreaIdRef.current;
    const ctx = panelContextRef.current;
    if (!ctx.screen) return;

    const candidates = ctx.screen.areas;

    if (!focusedId) {
      setFocusedAreaId(candidates[0]?.id ?? null);
      return;
    }

    const focusedArea = ctx.screen.areas.find(a => a.id === focusedId);
    if (!focusedArea) {
      setFocusedAreaId(candidates[0]?.id ?? null);
      return;
    }

    const vertexMap = new Map(ctx.screen.vertices.map(v => [v.id, v]));

    const dirMap: Record<string, Adjacency> = {
      up: 'north', down: 'south', left: 'west', right: 'east'
    };

    const target = candidates.find(a =>
      a.id !== focusedId && getAdjacency(focusedArea, a, vertexMap) === dirMap[direction]
    );

    if (target) setFocusedAreaId(target.id);
  }, []);

  const splitFocused = useCallback((axis: 'horizontal' | 'vertical') => {
    const focusedId = focusedAreaIdRef.current;
    const ctx = panelContextRef.current;
    if (!focusedId || !ctx.workspaceId || !ctx.sessionId) return;

    const oldAreaIds = new Set(ctx.screen?.areas.map(a => a.id) ?? []);

    safeInvoke<WorkspaceInstance>("split_area", {
      sessionId: ctx.sessionId,
      workspaceId: ctx.workspaceId,
      areaId: focusedId,
      axis,
      factor: axis === "vertical" ? 0.6 : 0.4,
    }, onError)
      .then(r => {
        handleScreenChange(ctx.workspaceId, r.current_screen);
        const newArea = r.current_screen.areas.find(a => !oldAreaIds.has(a.id));
        if (newArea) setFocusedAreaId(newArea.id);
      })
      .catch(() => {});
  }, [onError, handleScreenChange]);

  const closePanel = useCallback(() => {
    const focusedId = focusedAreaIdRef.current;
    const ctx = panelContextRef.current;
    if (!focusedId || !ctx.screen || !ctx.workspaceId || !ctx.sessionId) return;
    if (ctx.screen.areas.length <= 1) return;

    const area = ctx.screen.areas.find(a => a.id === focusedId);
    if (area?.terminal_id) {
      disposeTerminal(area.terminal_id);
    }

    safeInvoke<WorkspaceInstance>("close_area", {
      sessionId: ctx.sessionId,
      workspaceId: ctx.workspaceId,
      areaId: focusedId,
    }, onError)
      .then(r => {
        handleScreenChange(ctx.workspaceId, r.current_screen);
        const areas = r.current_screen.areas;
        if (areas.length > 0) {
          const firstTerminal = areas.find(a => a.panel_type === "terminal");
          setFocusedAreaId(firstTerminal?.id ?? areas[0].id);
        } else {
          setFocusedAreaId(null);
        }
      })
      .catch(() => {});
  }, [onError, handleScreenChange]);

  useEffect(() => {
    panelActionsRef.current = { navigateFocus, splitFocused, closePanel };
  }, [navigateFocus, splitFocused, closePanel, panelActionsRef]);

  useEffect(() => {
    setZoomedAreaId(null);
    const screen = activeWorkspace?.current_screen;
    if (screen && screen.areas.length > 0) {
      const firstTerminal = screen.areas.find(a => a.panel_type === "terminal");
      setFocusedAreaId(firstTerminal?.id ?? screen.areas[0].id);
    } else {
      setFocusedAreaId(null);
    }
  }, [activeWorkspace?.id]);

  const refreshTemplates = useCallback(() => {
    safeInvoke<Layout[]>("list_layouts", undefined, onError).then(setTemplates).catch(console.error);
  }, [onError]);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates, onError]);

  useTauriEvent("layouts-changed", useCallback(() => refreshTemplates(), [refreshTemplates]));

  useTauriEvent(
    "db-changed",
    useCallback(() => {
      refreshSessions();
    }, [refreshSessions]),
  );

  useTauriEvent<{ session_id: string; workspace_id: string; screen: Screen }>(
    "workspace-changed",
    useCallback((payload) => {
      handleExternalScreenChange(payload.session_id, payload.workspace_id, payload.screen);
    }, [handleExternalScreenChange]),
  );

  // MCP event routing (open-file-request, show-diff-request)
  useMcpEventRouting({
    sessionId: activeSessionId,
    workspaceId: activeWorkspace?.id ?? '',
    screen: activeWorkspace?.current_screen ?? null,
    focusedAreaIdRef,
    onError,
    handleScreenChange,
    setFocusedAreaId,
  });

  const handleSaveAsTemplate = useCallback((screen: Screen) => {
    setSaveAsTarget(screen);
    setSaveAsName("");
  }, []);

  const confirmSaveAsTemplate = useCallback(() => {
    if (!saveAsTarget || !saveAsName.trim()) return;
    safeInvoke<Layout>("save_layout", { name: saveAsName.trim(), screen: saveAsTarget }, onError)
      .then(() => refreshTemplates())
      .then(() => setSaveAsTarget(null))
      .catch(console.error);
  }, [saveAsTarget, saveAsName, refreshTemplates, onError]);

  const handleDeleteTemplate = useCallback((layoutId: string) => {
    safeInvoke("delete_layout", { layoutId }, onError)
      .then(() => refreshTemplates())
      .catch(console.error);
  }, [refreshTemplates, onError]);

  const handleRenameTemplate = useCallback((layoutId: string, newName: string) => {
    safeInvoke("rename_layout", { layoutId, newName }, onError)
      .then(() => refreshTemplates())
      .catch(console.error);
  }, [refreshTemplates, onError]);

  useKeyboardShortcuts([
    { key: "Tab", ctrl: true, handler: () => handleCycleWorkspace(1) },
    { key: "Tab", ctrl: true, shift: true, handler: () => handleCycleWorkspace(-1) },
  ]);

  // Stable per-workspace onScreenChange handlers — prevents ScreenRenderer from
  // receiving a new callback reference (and thus re-rendering) when only
  // focusedAreaId changes.
  const onScreenChangeHandlers = useMemo(() => {
    const map = new Map<string, (screen: Screen) => void>();
    for (const ws of workspaces) {
      map.set(ws.id, (screen: Screen) => handleScreenChange(ws.id, screen));
    }
    return map;
  }, [workspaces, handleScreenChange]);

  if (!activeSessionId) {
    return (
      <main className="main-content">
        <div className={`home-hint-svg ${isMac ? 'home-hint-svg--mac' : 'home-hint-svg--linux'}`} aria-label="Click + to create a new session" />
        <StatusBoard />
      </main>
    );
  }

  return (
    <main className="main-content">
      <LayoutTabs
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        onWorkspaceSwitch={handleWorkspaceSwitch}
        onCloseWorkspace={handleCloseWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onResetToTemplate={handleResetToTemplate}
        onSaveAsTemplate={handleSaveAsTemplate}
        onOpenNewWorkspace={() => { setNewWorkspaceInitialEditing(false); setNewWorkspaceOpen(true); }}
        onManageTemplates={() => { setNewWorkspaceInitialEditing(true); setNewWorkspaceOpen(true); }}
        openTabActionsRef={openTabActionsRef}
        closeTabActionsRef={closeTabActionsRef}
      />
      <NewWorkspaceModal
        open={newWorkspaceOpen}
        initialEditing={newWorkspaceInitialEditing}
        onClose={() => setNewWorkspaceOpen(false)}
        templates={templates}
        onSelect={(templateId) => {
          handleAddWorkspace(templateId);
          setNewWorkspaceOpen(false);
        }}
        onRenameTemplate={handleRenameTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      <SaveAsTemplateDialog
        open={saveAsTarget !== null}
        onClose={() => setSaveAsTarget(null)}
        onConfirm={confirmSaveAsTemplate}
        name={saveAsName}
        setName={setSaveAsName}
      />
      <div className="tab-content" style={{ position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: "var(--z-overlay)",
            background: 'rgba(18, 18, 18, 0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            Loading…
          </div>
        )}
        {sessions.map((session) => {
          const sd = sessionData.get(session.id);
          if (!sd) return null;
          return (
            <div
              key={session.id}
              style={{ display: session.id === activeSessionId ? 'block' : 'none', width: '100%', height: '100%' }}
            >
              {sd.workspaces.map((ws) => (
                <div
                  key={ws.id}
                  style={{ display: ws.id === sd.activeWorkspace?.id ? 'block' : 'none', width: '100%', height: '100%' }}
                >
                  <ScreenRenderer
                    workspaceId={ws.id}
                    sessionId={session.id}
                    screen={ws.current_screen}
                    focusedAreaId={focusedAreaId}
                    onFocusedAreaChange={setFocusedAreaId}
                    zoomedAreaId={zoomedAreaId}
                    onScreenChange={onScreenChangeHandlers.get(ws.id)!}
                    onError={onError}
                  />
                </div>
              ))}
            </div>
          );
        })}
        {!loading && workspaces.length === 0 && (
          <div className="empty-state">No active workspace</div>
        )}
      </div>
    </main>
  );
}

function KeyboardShortcutsHandler({ toggleZoomRef, panelActionsRef, openNewWorkspaceRef, openSessionActionsRef, closeSessionActionsRef, openTabActionsRef, closeTabActionsRef }: { toggleZoomRef: React.RefObject<(() => void) | null>; panelActionsRef: React.RefObject<PanelActions | null>; openNewWorkspaceRef: React.RefObject<(() => void) | null>; openSessionActionsRef: React.RefObject<((sessionId: string) => void) | null>; closeSessionActionsRef: React.RefObject<(() => void) | null>; openTabActionsRef: React.RefObject<(() => void) | null>; closeTabActionsRef: React.RefObject<(() => void) | null> }) {
  const {
    sessions, activeSessionId, setActiveSessionId,
    showNewSessionDialog, setShowNewSessionDialog, sidebarCollapsed, setSidebarCollapsed,
  } = useSessions();
  const { addToast } = useToast();
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleCycle = useCallback((dir: 1 | -1) => {
    if (sessions.length < 1) return;
    const nextId = !activeSessionId
      ? dir === 1 ? sessions[0].id : sessions[sessions.length - 1].id
      : (() => {
          const idx = sessions.findIndex((s) => s.id === activeSessionId);
          if (idx < 0) return sessions[0].id;
          return sessions[(idx + dir + sessions.length) % sessions.length].id;
        })();
    safeInvoke("open_session", { sessionId: nextId }, (msg) => addToast({ type: "error", message: msg }))
      .then(() => setActiveSessionId(nextId))
      .catch(console.error);
  }, [sessions, activeSessionId, setActiveSessionId, addToast]);

  useKeyboardShortcuts([
    { key: "?", shift: true, handler: () => setShowShortcuts((v) => !v), ignoreInputs: true },
    { code: "BracketRight", meta: true, shift: true, handler: () => handleCycle(1) },
    { code: "BracketLeft", meta: true, shift: true, handler: () => handleCycle(-1) },
    { key: "ArrowDown", meta: true, shift: true, handler: () => panelActionsRef.current?.navigateFocus('down'), ignoreInputs: true },
    { key: "ArrowUp", meta: true, shift: true, handler: () => panelActionsRef.current?.navigateFocus('up'), ignoreInputs: true },
    { key: "ArrowLeft", meta: true, shift: true, handler: () => panelActionsRef.current?.navigateFocus('left'), ignoreInputs: true },
    { key: "ArrowRight", meta: true, shift: true, handler: () => panelActionsRef.current?.navigateFocus('right'), ignoreInputs: true },
    { key: "d", meta: true, handler: () => panelActionsRef.current?.splitFocused('vertical'), ignoreInputs: true },
    { key: "d", meta: true, shift: true, handler: () => panelActionsRef.current?.splitFocused('horizontal'), ignoreInputs: true },
    { key: "w", meta: true, handler: () => panelActionsRef.current?.closePanel(), ignoreInputs: true },
    { key: "Enter", meta: true, shift: true, handler: () => toggleZoomRef.current?.() },
    { key: "n", meta: true, handler: () => setShowNewSessionDialog(!showNewSessionDialog) },
    { key: "t", meta: true, handler: () => openNewWorkspaceRef.current?.() },
    { key: ";", meta: true, handler: () => { closeTabActionsRef.current?.(); if (activeSessionId) openSessionActionsRef.current?.(activeSessionId); }, ignoreInputs: true },
    { key: "'", meta: true, handler: () => { closeSessionActionsRef.current?.(); openTabActionsRef.current?.(); }, ignoreInputs: true },
    { code: "Backslash", meta: true, handler: () => setSidebarCollapsed(!sidebarCollapsed), ignoreInputs: true },
  ]);

  return <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />;
}

function App() {
  const toggleZoomRef = useRef<(() => void) | null>(null);
  const panelActionsRef = useRef<PanelActions | null>(null);
  const openNewWorkspaceRef = useRef<(() => void) | null>(null);
  const openSessionActionsRef = useRef<((sessionId: string) => void) | null>(null);
  const closeSessionActionsRef = useRef<(() => void) | null>(null);
  const openTabActionsRef = useRef<(() => void) | null>(null);
  const closeTabActionsRef = useRef<(() => void) | null>(null);

  return (
    <TerminalCacheProvider>
      <WebGLPoolProvider>
        <ViewerRegistryProvider>
            <ToastProvider>
              <SessionProvider>
                <div className="app-layout">
                  <ErrorBoundary name="Sidebar">
                    <SessionSidebar openActionsRef={openSessionActionsRef} closeActionsRef={closeSessionActionsRef} />
                  </ErrorBoundary>
                  <ErrorBoundary name="Workspace">
                    <MainArea toggleZoomRef={toggleZoomRef} panelActionsRef={panelActionsRef} openNewWorkspaceRef={openNewWorkspaceRef} openTabActionsRef={openTabActionsRef} closeTabActionsRef={closeTabActionsRef} />
                  </ErrorBoundary>
                </div>
                <KeyboardShortcutsHandler toggleZoomRef={toggleZoomRef} panelActionsRef={panelActionsRef} openNewWorkspaceRef={openNewWorkspaceRef} openSessionActionsRef={openSessionActionsRef} closeSessionActionsRef={closeSessionActionsRef} openTabActionsRef={openTabActionsRef} closeTabActionsRef={closeTabActionsRef} />
              </SessionProvider>
              <ToastContainer />
            </ToastProvider>
        </ViewerRegistryProvider>
      </WebGLPoolProvider>
    </TerminalCacheProvider>
  );
}

export default App;
