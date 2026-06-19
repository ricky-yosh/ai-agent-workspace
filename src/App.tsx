import { useState, useEffect, useCallback, useRef } from "react";
import { safeInvoke } from "./safeInvoke";
import { SessionProvider, useSessions } from "./SessionContext";
import SessionSidebar from "./SessionSidebar";
import SplitLayout from "./SplitLayout";
import LayoutTabs from "./LayoutTabs";
import ManageTemplatesModal from "./ManageTemplatesModal";
import type { Layout, LayoutTree } from "./SplitLayout";
import ShortcutsModal from "./ShortcutsModal";
import { ToastProvider, useToast } from "./ToastContext";
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

interface SessionWorkspaceData {
  workspaces: WorkspaceInstance[];
  activeWorkspace: WorkspaceInstance | null;
  loading: boolean;
}

function useWorkspaceManager(onError?: (msg: string) => void) {
  const { sessions, activeSessionId } = useSessions();
  const [sessionData, setSessionData] = useState<Map<string, SessionWorkspaceData>>(new Map());
  const loadedSessionsRef = useRef<Set<string>>(new Set());

  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const sessionIdsStr = sessions.map(s => s.id).sort().join(',');

  useEffect(() => {
    const ids = new Set(sessions.map(s => s.id));

    for (const sid of ids) {
      if (!loadedSessionsRef.current.has(sid)) {
        loadedSessionsRef.current.add(sid);

        setSessionData(prev => {
          const next = new Map(prev);
          next.set(sid, { workspaces: [], activeWorkspace: null, loading: true });
          return next;
        });

        Promise.all([
          safeInvoke<WorkspaceInstance[]>("get_session_workspaces", { sessionId: sid }, onError),
          safeInvoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: sid }, onError),
        ]).then(([wsList, active]) => {
          setSessionData(prev => {
            const next = new Map(prev);
            next.set(sid, {
              workspaces: wsList,
              activeWorkspace: active ? { ...active, current_tree: migrateWorkspaceTree(active.current_tree) } : null,
              loading: false,
            });
            return next;
          });
        }).catch(() => {
          setSessionData(prev => {
            const next = new Map(prev);
            next.set(sid, { workspaces: [], activeWorkspace: null, loading: false });
            return next;
          });
        });
      }
    }

    for (const sid of loadedSessionsRef.current) {
      if (!ids.has(sid)) {
        loadedSessionsRef.current.delete(sid);
        setSessionData(prev => {
          const next = new Map(prev);
          next.delete(sid);
          return next;
        });
      }
    }
  }, [sessionIdsStr]);

  const currentData = activeSessionId ? sessionData.get(activeSessionId) : undefined;
  const workspaces = currentData?.workspaces ?? [];
  const activeWorkspace = currentData?.activeWorkspace ?? null;
  const loading = currentData?.loading ?? false;

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  const activeWorkspaceRef = useRef(activeWorkspace);
  activeWorkspaceRef.current = activeWorkspace;

  const handleWorkspaceTreeChange = useCallback((workspaceId: string, newTree: LayoutTree) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    setSessionData(prev => {
      const next = new Map(prev);
      const sd = next.get(sid);
      if (!sd) return prev;
      next.set(sid, {
        ...sd,
        workspaces: sd.workspaces.map(w =>
          w.id === workspaceId ? { ...w, current_tree: newTree } : w
        ),
        activeWorkspace: sd.activeWorkspace?.id === workspaceId
          ? { ...sd.activeWorkspace, current_tree: newTree }
          : sd.activeWorkspace,
      });
      return next;
    });
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      safeInvoke("persist_workspace_tree", {
        sessionId: sid,
        workspaceId,
        tree: newTree,
      }, onError).catch(console.error);
    }, 200);
  }, []);

  const handleWorkspaceSwitch = useCallback((workspaceId: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    safeInvoke("set_active_workspace", { sessionId: sid, workspaceId }, onError)
      .then(() => safeInvoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: sid }, onError))
      .then((active) => {
        setSessionData(prev => {
          const next = new Map(prev);
          const sd = next.get(sid);
          if (!sd) return prev;
          next.set(sid, { ...sd, activeWorkspace: active });
          return next;
        });
      })
      .catch(console.error);
  }, []);

  const handleAddWorkspace = useCallback((templateId: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    safeInvoke<WorkspaceInstance>("add_workspace", { sessionId: sid, templateId }, onError)
      .then((ws) => {
        return safeInvoke("set_active_workspace", { sessionId: sid, workspaceId: ws.id }, onError)
          .then(() => safeInvoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: sid }, onError))
          .then((active) => {
            setSessionData(prev => {
              const next = new Map(prev);
              const sd = next.get(sid);
              if (!sd) return prev;
              next.set(sid, { ...sd, workspaces: [...sd.workspaces, ws], activeWorkspace: active });
              return next;
            });
          });
      })
      .catch(console.error);
  }, []);

  const handleCloseWorkspace = useCallback((workspaceId: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    const aw = activeWorkspaceRef.current;
    safeInvoke("remove_workspace", { sessionId: sid, workspaceId }, onError)
      .then(() => {
        setSessionData(prev => {
          const next = new Map(prev);
          const sd = next.get(sid);
          if (!sd) return prev;
          next.set(sid, {
            ...sd,
            workspaces: sd.workspaces.filter(w => w.id !== workspaceId),
            activeWorkspace: sd.activeWorkspace?.id === workspaceId ? null : sd.activeWorkspace,
          });
          return next;
        });
        if (aw?.id === workspaceId) {
          return safeInvoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: sid }, onError);
        }
        return null;
      })
      .then((newActive) => {
        if (newActive !== null) {
          setSessionData(prev => {
            const next = new Map(prev);
            const sd = next.get(sid!);
            if (!sd) return prev;
            next.set(sid!, { ...sd, activeWorkspace: newActive as WorkspaceInstance | null });
            return next;
          });
        }
      })
      .catch(console.error);
  }, []);

  const handleRenameWorkspace = useCallback((workspaceId: string, newName: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    safeInvoke("rename_workspace", { sessionId: sid, workspaceId, newName }, onError)
      .then(() => {
        setSessionData(prev => {
          const next = new Map(prev);
          const sd = next.get(sid);
          if (!sd) return prev;
          next.set(sid, {
            ...sd,
            workspaces: sd.workspaces.map(w => w.id === workspaceId ? { ...w, name: newName } : w),
            activeWorkspace: sd.activeWorkspace?.id === workspaceId
              ? { ...sd.activeWorkspace, name: newName }
              : sd.activeWorkspace,
          });
          return next;
        });
      })
      .catch(console.error);
  }, []);

  const handleResetToTemplate = useCallback((workspaceId: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    safeInvoke<WorkspaceInstance>("reset_workspace_to_template", { sessionId: sid, workspaceId }, onError)
      .then((ws) => {
        setSessionData(prev => {
          const next = new Map(prev);
          const sd = next.get(sid);
          if (!sd) return prev;
          next.set(sid, {
            ...sd,
            workspaces: sd.workspaces.map(w => w.id === ws.id ? ws : w),
            activeWorkspace: sd.activeWorkspace?.id === ws.id ? ws : sd.activeWorkspace,
          });
          return next;
        });
      })
      .catch(console.error);
  }, []);

  const handleCycleWorkspace = useCallback((dir: 1 | -1) => {
    const ws = workspacesRef.current;
    const aw = activeWorkspaceRef.current;
    if (ws.length < 2 || !aw) return;
    const idx = ws.findIndex(w => w.id === aw.id);
    if (idx < 0) return;
    const next = ws[(idx + dir + ws.length) % ws.length];
    handleWorkspaceSwitch(next.id);
  }, [handleWorkspaceSwitch]);

  return {
    workspaces,
    activeWorkspace,
    loading,
    sessionData,
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
  const { activeSessionId, sessions } = useSessions();
  const { addToast } = useToast();
  const onError = useCallback((msg: string) => addToast({ type: "error", message: msg }), [addToast]);
  const {
    workspaces, activeWorkspace, loading, sessionData,
    handleWorkspaceTreeChange, handleWorkspaceSwitch,
    handleAddWorkspace, handleCloseWorkspace,
    handleRenameWorkspace, handleResetToTemplate,
    handleCycleWorkspace,
  } = useWorkspaceManager(onError);

  const [templates, setTemplates] = useState<Layout[]>([]);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [saveAsTarget, setSaveAsTarget] = useState<LayoutTree | null>(null);
  const [saveAsName, setSaveAsName] = useState("");
  const [focusedPath, setFocusedPath] = useState<number[] | null>(null);
  const focusedPathRef = useRef<number[] | null>(null);
  const [zoomedPath, setZoomedPath] = useState<number[] | null>(null);

  const toggleZoom = useCallback(() => {
    const fp = focusedPathRef.current;
    if (!fp) return;
    setZoomedPath((prev) =>
      prev && pathsEqual(prev, fp) ? null : fp
    );
  }, []);

  useEffect(() => {
    focusedPathRef.current = focusedPath;
  }, [focusedPath]);

  useEffect(() => {
    toggleZoomRef.current = toggleZoom;
  }, [toggleZoom, toggleZoomRef]);

  useEffect(() => {
    setZoomedPath(null);
  }, [activeWorkspace?.id]);

  const refreshTemplates = useCallback(() => {
    safeInvoke<Layout[]>("list_layouts", undefined, onError).then(setTemplates).catch(console.error);
  }, [onError]);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates, onError]);

  useTauriEvent("layouts-changed", useCallback(() => refreshTemplates(), [refreshTemplates]));

  const handleSaveAsTemplate = useCallback((tree: LayoutTree) => {
    setSaveAsTarget(tree);
    setSaveAsName("");
  }, []);

  const confirmSaveAsTemplate = useCallback(() => {
    if (!saveAsTarget || !saveAsName.trim()) return;
    safeInvoke<Layout>("save_layout", { name: saveAsName.trim(), tree: saveAsTarget }, onError)
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

  if (!activeSessionId) {
    return (
      <main className="main-content">
        <div className="empty-state">Open a Session to begin</div>
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
      <div className="tab-content" style={{ position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 100,
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
                  <SplitLayout
                    workspaceId={ws.id}
                    sessionId={session.id}
                    tree={ws.current_tree}
                    onLayoutChange={(newTree) => handleWorkspaceTreeChange(ws.id, newTree)}
                    focusedPath={focusedPath}
                    onFocusedPathChange={setFocusedPath}
                    zoomedPath={zoomedPath}
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

function KeyboardShortcutsHandler({ toggleZoomRef }: { toggleZoomRef: React.RefObject<(() => void) | null> }) {
  const {
    sessions, activeSessionId, setActiveSessionId, refreshSessions,
    setShowNewSessionDialog, sidebarCollapsed, setSidebarCollapsed,
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

  const handleCloseSession = useCallback(() => {
    if (!activeSessionId) return;
    safeInvoke("close_session", { sessionId: activeSessionId }, (msg) => addToast({ type: "error", message: msg }))
      .then(() => {
        setActiveSessionId(null);
        refreshSessions();
      })
      .catch(console.error);
  }, [activeSessionId, setActiveSessionId, refreshSessions, addToast]);

  useKeyboardShortcuts([
    { key: "?", shift: true, handler: () => setShowShortcuts((v) => !v), ignoreInputs: true },
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
