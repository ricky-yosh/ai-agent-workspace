import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionProvider, useSessions } from "./SessionContext";
import SessionSidebar from "./SessionSidebar";
import SplitLayout from "./SplitLayout";
import LayoutTabs from "./LayoutTabs";
import ManageTemplatesModal from "./ManageTemplatesModal";
import type { Layout, LayoutTree } from "./SplitLayout";
import ShortcutsModal from "./ShortcutsModal";
import { ToastProvider } from "./ToastContext";
import { ToastContainer } from "./Toast";
import { pathsEqual } from "./utils/pathUtils";
import { migrateWorkspaceTree } from "./utils/migrateTree";
import { useEventListener } from "./hooks/useEventListener";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { Dialog } from "./components/Dialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./BlankPanel";
import "./TerminalPanel";
import "./App.css";
import "./Toast.css";
import "./Dialog.css";

interface WorkspaceInstance {
  id: string;
  name: string;
  template_id: string;
  current_tree: LayoutTree;
}

interface Shortcut {
  key?: string;
  code?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  ignoreInputs?: boolean;
}

function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handler = useCallback((e: KeyboardEvent) => {
    for (const s of shortcutsRef.current) {
      const inInput = !!(e.target instanceof HTMLElement && (e.target as HTMLElement).closest?.("input, textarea, [contenteditable]"));
      if (s.ignoreInputs && inInput) continue;
      if ((s.ctrl ?? false) !== e.ctrlKey) continue;
      if ((s.meta ?? false) !== e.metaKey) continue;
      if ((s.shift ?? false) !== e.shiftKey) continue;
      if ((s.alt ?? false) !== e.altKey) continue;
      if (s.key !== undefined && e.key !== s.key) continue;
      if (s.code !== undefined && e.code !== s.code) continue;
      e.preventDefault();
      s.handler();
      return;
    }
  }, []);

  useEventListener(document, "keydown", handler, []);
}

function useWorkspaceManager(activeSessionId: string | null) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInstance[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceInstance | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeSessionId) {
      setLoading(true);
      Promise.all([
        invoke<WorkspaceInstance[]>("get_session_workspaces", { sessionId: activeSessionId }),
        invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId }),
      ]).then(([wsList, active]) => {
        setWorkspaces(wsList);
        if (active) {
          setActiveWorkspace({ ...active, current_tree: migrateWorkspaceTree(active.current_tree) });
        } else {
          setActiveWorkspace(null);
        }
      }).catch(() => {
        setWorkspaces([]);
        setActiveWorkspace(null);
      }).finally(() => setLoading(false));
    } else {
      setWorkspaces([]);
      setActiveWorkspace(null);
      setLoading(false);
    }
  }, [activeSessionId]);

  useTauriEvent("sessions-changed", () => {
    if (activeSessionId) {
      invoke<WorkspaceInstance[]>("get_session_workspaces", { sessionId: activeSessionId })
        .then(setWorkspaces)
        .catch(console.error);
      invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId })
        .then((ws) => {
          if (ws) {
            setActiveWorkspace({ ...ws, current_tree: migrateWorkspaceTree(ws.current_tree) });
          } else {
            setActiveWorkspace(null);
          }
        })
        .catch(console.error);
    }
  }, [activeSessionId]);

  const handleWorkspaceTreeChange = useCallback((newTree: LayoutTree) => {
    if (!activeWorkspace) return;
    invoke("persist_workspace_tree", {
      sessionId: activeSessionId,
      workspaceId: activeWorkspace.id,
      tree: newTree,
    }).catch(console.error);
    setActiveWorkspace((prev) => prev ? { ...prev, current_tree: newTree } : null);
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === activeWorkspace?.id ? { ...w, current_tree: newTree } : w
      )
    );
  }, [activeWorkspace, activeSessionId]);

  const handleWorkspaceSwitch = useCallback((workspaceId: string) => {
    if (!activeSessionId) return;
    invoke("set_active_workspace", { sessionId: activeSessionId, workspaceId })
      .then(() => invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId }))
      .then(setActiveWorkspace)
      .catch(console.error);
  }, [activeSessionId]);

  const handleAddWorkspace = useCallback((templateId: string) => {
    if (!activeSessionId) return;
    invoke<WorkspaceInstance>("add_workspace", { sessionId: activeSessionId, templateId })
      .then((ws) => {
        setWorkspaces((prev) => [...prev, ws]);
        return invoke("set_active_workspace", { sessionId: activeSessionId, workspaceId: ws.id })
          .then(() => invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId }));
      })
      .then((active) => setActiveWorkspace(active))
      .catch(console.error);
  }, [activeSessionId]);

  const handleCloseWorkspace = useCallback((workspaceId: string) => {
    if (!activeSessionId) return;
    invoke("remove_workspace", { sessionId: activeSessionId, workspaceId })
      .then(() => {
        setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
        if (activeWorkspace?.id === workspaceId) {
          return invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId });
        }
        return null;
      })
      .then((newActive) => {
        if (newActive !== null) setActiveWorkspace(newActive as WorkspaceInstance | null);
      })
      .catch(console.error);
  }, [activeSessionId, activeWorkspace]);

  const handleRenameWorkspace = useCallback((workspaceId: string, newName: string) => {
    if (!activeSessionId) return;
    invoke("rename_workspace", { sessionId: activeSessionId, workspaceId, newName })
      .then(() => {
        setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? { ...w, name: newName } : w)));
        if (activeWorkspace?.id === workspaceId) {
          setActiveWorkspace((prev) => prev ? { ...prev, name: newName } : null);
        }
      })
      .catch(console.error);
  }, [activeSessionId, activeWorkspace]);

  const handleResetToTemplate = useCallback((workspaceId: string) => {
    if (!activeSessionId) return;
    invoke<WorkspaceInstance>("reset_workspace_to_template", {
      sessionId: activeSessionId,
      workspaceId,
    }).then((ws) => {
      setActiveWorkspace(ws);
      setWorkspaces((prev) => prev.map((w) => (w.id === ws.id ? ws : w)));
    }).catch(console.error);
  }, [activeSessionId]);

  const handleCycleWorkspace = useCallback((dir: 1 | -1) => {
    if (workspaces.length < 2 || !activeWorkspace) return;
    const idx = workspaces.findIndex((w) => w.id === activeWorkspace.id);
    if (idx < 0) return;
    const next = workspaces[(idx + dir + workspaces.length) % workspaces.length];
    handleWorkspaceSwitch(next.id);
  }, [workspaces, activeWorkspace, handleWorkspaceSwitch]);

  return {
    workspaces,
    activeWorkspace,
    loading,
    handleWorkspaceTreeChange,
    handleWorkspaceSwitch,
    handleAddWorkspace,
    handleCloseWorkspace,
    handleRenameWorkspace,
    handleResetToTemplate,
    handleCycleWorkspace,
  };
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
      <input
        className="dialog-input"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
        }}
        placeholder="Template name..."
        style={{ boxSizing: "border-box", width: "100%", marginBottom: 16 }}
      />
      <div className="dialog-actions">
        <button className="dialog-btn" onClick={onClose}>Cancel</button>
        <button className="dialog-btn dialog-btn-primary" onClick={onConfirm}>Save</button>
      </div>
    </Dialog>
  );
}

function MainArea({ toggleZoomRef }: { toggleZoomRef: React.RefObject<(() => void) | null> }) {
  const { activeSessionId } = useSessions();
  const {
    workspaces, activeWorkspace, loading,
    handleWorkspaceTreeChange, handleWorkspaceSwitch,
    handleAddWorkspace, handleCloseWorkspace,
    handleRenameWorkspace, handleResetToTemplate,
    handleCycleWorkspace,
  } = useWorkspaceManager(activeSessionId);

  const [templates, setTemplates] = useState<Layout[]>([]);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [saveAsTarget, setSaveAsTarget] = useState<LayoutTree | null>(null);
  const [saveAsName, setSaveAsName] = useState("");
  const [focusedPath, setFocusedPath] = useState<number[] | null>(null);
  const [zoomedPath, setZoomedPath] = useState<number[] | null>(null);

  const toggleZoom = useCallback(() => {
    if (!focusedPath) return;
    setZoomedPath((prev) =>
      prev && pathsEqual(prev, focusedPath) ? null : focusedPath
    );
  }, [focusedPath]);

  useEffect(() => {
    toggleZoomRef.current = toggleZoom;
  }, [toggleZoom, toggleZoomRef]);

  useEffect(() => {
    setZoomedPath(null);
  }, [activeWorkspace?.id]);

  const refreshTemplates = useCallback(() => {
    invoke<Layout[]>("list_layouts").then(setTemplates).catch(console.error);
  }, []);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  useTauriEvent("layouts-changed", useCallback(() => refreshTemplates(), [refreshTemplates]));

  const handleSaveAsTemplate = useCallback((tree: LayoutTree) => {
    setSaveAsTarget(tree);
    setSaveAsName("");
  }, []);

  const confirmSaveAsTemplate = useCallback(() => {
    if (!saveAsTarget || !saveAsName.trim()) return;
    invoke<Layout>("save_layout", { name: saveAsName.trim(), tree: saveAsTarget })
      .then(() => refreshTemplates())
      .then(() => setSaveAsTarget(null))
      .catch(console.error);
  }, [saveAsTarget, saveAsName, refreshTemplates]);

  const handleDeleteTemplate = useCallback((layoutId: string) => {
    invoke("delete_layout", { layoutId })
      .then(() => refreshTemplates())
      .catch(console.error);
  }, [refreshTemplates]);

  const handleRenameTemplate = useCallback((layoutId: string, newName: string) => {
    invoke("rename_layout", { layoutId, newName })
      .then(() => refreshTemplates())
      .catch(console.error);
  }, [refreshTemplates]);

  useKeyboardShortcuts([
    { key: "Tab", ctrl: true, handler: () => handleCycleWorkspace(1) },
    { key: "Tab", ctrl: true, shift: true, handler: () => handleCycleWorkspace(-1) },
  ]);

  if (!activeSessionId) {
    return (
      <main className="main-content">
        <div className="empty-state">Open a Session to begin</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="main-content">
        <div className="empty-state">Loading...</div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <LayoutTabs
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        templates={templates}
        onWorkspaceSwitch={handleWorkspaceSwitch}
        onAddWorkspace={handleAddWorkspace}
        onCloseWorkspace={handleCloseWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onResetToTemplate={handleResetToTemplate}
        onSaveAsTemplate={handleSaveAsTemplate}
        onOpenTemplateManager={() => setTemplateManagerOpen(true)}
      />
      {templateManagerOpen && (
        <ManageTemplatesModal
          templates={templates}
          onRenameTemplate={handleRenameTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onClose={() => setTemplateManagerOpen(false)}
        />
      )}
      <SaveAsTemplateDialog
        open={saveAsTarget !== null}
        onClose={() => setSaveAsTarget(null)}
        onConfirm={confirmSaveAsTemplate}
        name={saveAsName}
        setName={setSaveAsName}
      />
      <div className="tab-content">
        {activeWorkspace ? (
          <SplitLayout
            workspaceId={activeWorkspace.id}
            sessionId={activeSessionId}
            tree={activeWorkspace.current_tree}
            onLayoutChange={handleWorkspaceTreeChange}
            focusedPath={focusedPath}
            onFocusedPathChange={setFocusedPath}
            zoomedPath={zoomedPath}
          />
        ) : (
          <div className="empty-state">No active workspace</div>
        )}
      </div>
    </main>
  );
}

function KeyboardShortcutsHandler({ toggleZoomRef }: { toggleZoomRef: React.RefObject<(() => void) | null> }) {
  const {
    sessions, activeSessionId, setActiveSessionId, refreshSessions,
    setShowNewSessionDialog, sidebarCollapsed, setSidebarCollapsed,
  } = useSessions();
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
    invoke("open_session", { sessionId: nextId })
      .then(() => setActiveSessionId(nextId))
      .catch(console.error);
  }, [sessions, activeSessionId, setActiveSessionId]);

  const handleCloseSession = useCallback(() => {
    if (!activeSessionId) return;
    invoke("close_session", { sessionId: activeSessionId })
      .then(() => {
        setActiveSessionId(null);
        refreshSessions();
      })
      .catch(console.error);
  }, [activeSessionId, setActiveSessionId, refreshSessions]);

  useKeyboardShortcuts([
    { key: "?", handler: () => setShowShortcuts((v) => !v), ignoreInputs: true },
    { code: "BracketRight", meta: true, shift: true, handler: () => handleCycle(1) },
    { code: "BracketLeft", meta: true, shift: true, handler: () => handleCycle(-1) },
    { key: "ArrowDown", meta: true, alt: true, handler: () => handleCycle(1), ignoreInputs: true },
    { key: "ArrowUp", meta: true, alt: true, handler: () => handleCycle(-1), ignoreInputs: true },
    { key: "Enter", meta: true, shift: true, handler: () => toggleZoomRef.current?.() },
    { key: "n", meta: true, handler: () => setShowNewSessionDialog(true), ignoreInputs: true },
    { key: "w", meta: true, handler: handleCloseSession, ignoreInputs: true },
    { code: "Backslash", meta: true, handler: () => setSidebarCollapsed(!sidebarCollapsed), ignoreInputs: true },
  ]);

  return showShortcuts ? <ShortcutsModal onClose={() => setShowShortcuts(false)} /> : null;
}

function App() {
  const toggleZoomRef = useRef<(() => void) | null>(null);

  return (
    <ToastProvider>
      <SessionProvider>
        <div className="app-layout">
          <ErrorBoundary name="Sidebar">
            <SessionSidebar />
          </ErrorBoundary>
          <ErrorBoundary name="Workspace">
            <MainArea toggleZoomRef={toggleZoomRef} />
          </ErrorBoundary>
        </div>
        <KeyboardShortcutsHandler toggleZoomRef={toggleZoomRef} />
      </SessionProvider>
      <ToastContainer />
    </ToastProvider>
  );
}

export default App;
