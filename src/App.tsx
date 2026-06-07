import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SessionProvider, useSessions } from "./SessionContext";
import SessionSidebar from "./SessionSidebar";
import SplitLayout from "./SplitLayout";
import LayoutTabs from "./LayoutTabs";
import ManageTemplatesModal from "./ManageTemplatesModal";
import type { Layout, LayoutTree } from "./SplitLayout";
import ShortcutsModal from "./ShortcutsModal";
import "./BlankPanel";
import "./App.css";

interface WorkspaceInstance {
  id: string;
  name: string;
  template_id: string;
  current_tree: LayoutTree;
}

function MainArea() {
  const { activeSessionId } = useSessions();
  const [workspaces, setWorkspaces] = useState<WorkspaceInstance[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceInstance | null>(null);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Layout[]>([]);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [saveAsTarget, setSaveAsTarget] = useState<LayoutTree | null>(null);
  const [saveAsName, setSaveAsName] = useState("");

  const refreshTemplates = useCallback(() => {
    invoke<Layout[]>("list_layouts").then(setTemplates).catch(console.error);
  }, []);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  useEffect(() => {
    if (activeSessionId) {
      setLoading(true);
      Promise.all([
        invoke<WorkspaceInstance[]>("get_session_workspaces", { sessionId: activeSessionId }),
        invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId }),
      ]).then(([wsList, active]) => {
        setWorkspaces(wsList);
        setActiveWorkspace(active);
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

  useEffect(() => {
    console.log("[MainArea] Setting up event listeners");
    const unlistenSessions = listen("sessions-changed", () => {
      console.log("[MainArea] Received sessions-changed event");
      if (activeSessionId) {
        console.log("[MainArea] Re-fetching workspaces for session:", activeSessionId);
        invoke<WorkspaceInstance[]>("get_session_workspaces", { sessionId: activeSessionId })
          .then(setWorkspaces)
          .catch(console.error);
        invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId })
          .then(setActiveWorkspace)
          .catch(console.error);
      }
    });
    const unlistenLayouts = listen("layouts-changed", () => {
      console.log("[MainArea] Received layouts-changed event");
      refreshTemplates();
    });
    return () => {
      unlistenSessions.then((fn) => fn());
      unlistenLayouts.then((fn) => fn());
    };
  }, [activeSessionId, refreshTemplates]);

  const handleWorkspaceTreeChange = (newTree: LayoutTree) => {
    if (!activeWorkspace) return;
    setActiveWorkspace({ ...activeWorkspace, current_tree: newTree });
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === activeWorkspace.id ? { ...w, current_tree: newTree } : w
      )
    );
    invoke("update_workspace_tree", {
      sessionId: activeSessionId,
      workspaceId: activeWorkspace.id,
      tree: newTree,
    }).catch(console.error);
  };

  const handleWorkspaceSwitch = useCallback((workspaceId: string) => {
    if (!activeSessionId) return;
    invoke("set_active_workspace", { sessionId: activeSessionId, workspaceId })
      .then(() => invoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: activeSessionId }))
      .then(setActiveWorkspace)
      .catch(console.error);
  }, [activeSessionId]);

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

  useEffect(() => {
    if (!saveAsTarget) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSaveAsTarget(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [saveAsTarget]);

  const handleCycleWorkspace = useCallback((dir: 1 | -1) => {
    if (workspaces.length < 2 || !activeWorkspace) return;
    const idx = workspaces.findIndex((w) => w.id === activeWorkspace.id);
    if (idx < 0) return;
    const next = workspaces[(idx + dir + workspaces.length) % workspaces.length];
    handleWorkspaceSwitch(next.id);
  }, [workspaces, activeWorkspace, handleWorkspaceSwitch]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        handleCycleWorkspace(e.shiftKey ? -1 : 1);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleCycleWorkspace]);

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
      {saveAsTarget && (
        <div className="dialog-overlay" onClick={() => setSaveAsTarget(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
            <div className="dialog-title">Save as Template</div>
            <input
              className="dialog-input"
              autoFocus
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmSaveAsTemplate();
                if (e.key === "Escape") setSaveAsTarget(null);
              }}
              placeholder="Template name..."
              style={{ boxSizing: "border-box", width: "100%", marginBottom: 16 }}
            />
            <div className="dialog-actions">
              <button className="dialog-btn" onClick={() => setSaveAsTarget(null)}>Cancel</button>
              <button className="dialog-btn dialog-btn-primary" onClick={confirmSaveAsTemplate}>Save</button>
            </div>
          </div>
        </div>
      )}
      <div className="tab-content">
        {activeWorkspace ? (
          <SplitLayout tree={activeWorkspace.current_tree} onLayoutChange={handleWorkspaceTreeChange} />
        ) : (
          <div className="empty-state">No active workspace</div>
        )}
      </div>
    </main>
  );
}

function KeyboardShortcutsHandler() {
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const inInput = !!(e.target instanceof HTMLElement && (e.target as HTMLElement).closest?.("input, textarea, [contenteditable]"));

      if (
        e.key === "?" &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        !inInput
      ) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }

      if (e.metaKey && e.shiftKey && (e.code === "BracketRight" || e.code === "BracketLeft")) {
        e.preventDefault();
        handleCycle(e.code === "BracketRight" ? 1 : -1);
        return;
      }

      if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !inInput) {
        e.preventDefault();
        handleCycle(e.key === "ArrowDown" ? 1 : -1);
        return;
      }

      if (e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !inInput) {
        if (e.key === "n") {
          e.preventDefault();
          setShowNewSessionDialog(true);
          return;
        }
        if (e.key === "w") {
          e.preventDefault();
          handleCloseSession();
          return;
        }
        if (e.code === "Backslash") {
          e.preventDefault();
          setSidebarCollapsed(!sidebarCollapsed);
          return;
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleCycle, handleCloseSession, setShowNewSessionDialog, sidebarCollapsed, setSidebarCollapsed]);

  return showShortcuts ? <ShortcutsModal onClose={() => setShowShortcuts(false)} /> : null;
}

function App() {
  return (
    <SessionProvider>
      <div className="app-layout">
        <SessionSidebar />
        <MainArea />
      </div>
      <KeyboardShortcutsHandler />
    </SessionProvider>
  );
}

export default App;
