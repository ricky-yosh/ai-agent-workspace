import { useState, useRef, useEffect } from "react";
import { PanelLeftClose, PanelLeft, Plus, ArrowLeft, FolderOpen, FolderInput } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useSessions, type SessionSummary } from "./SessionContext";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { Store } from "@tauri-apps/plugin-store";
import { useToast } from "./ToastContext";
import "./SessionSidebar.css";
import "./ContextMenu.css";

function folderNameOf(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export default function SessionSidebar() {
  const {
    sessions, activeSessionId, setActiveSessionId, refreshSessions,
    showNewSessionDialog, setShowNewSessionDialog,
    sidebarCollapsed, setSidebarCollapsed,
  } = useSessions();
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizingState, setIsResizingState] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkingDir, setNewWorkingDir] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const newNameEditedRef = useRef(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);

  const { addToast } = useToast();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isResizing = useRef(false);
  const lastWidth = useRef(280);

  const grouped = sessions.reduce<Record<string, SessionSummary[]>>(
    (acc, s) => {
      const parts = s.working_directory.replace(/\/$/, "").split("/");
      const folder = parts[parts.length - 1] || s.working_directory;
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(s);
      return acc;
    },
    {},
  );
  const groupKeys = Object.keys(grouped).sort();

  function applyWorkingDir(path: string) {
    setNewWorkingDir(path);
    if (!newNameEditedRef.current) {
      setNewName(folderNameOf(path));
    }
  }

  useEffect(() => {
    if (!showNewSessionDialog) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setIsDragOver(true);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          const path = event.payload.paths[0];
          if (path) applyWorkingDir(path);
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
      setIsDragOver(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewSessionDialog]);

  function handleSelect(id: string) {
    if (id === activeSessionId) return;
    invoke("open_session", { sessionId: id }).then(() => {
      setActiveSessionId(id);
      refreshSessions();
    });
  }

  function handleCreate() {
    if (!newName.trim() || !newWorkingDir.trim()) return;
    invoke<SessionSummary>("create_session", {
      workingDir: newWorkingDir.trim(),
      name: newName.trim(),
    }).then((session) => {
      setShowNewSessionDialog(false);
      setNewName("");
      setNewWorkingDir("");
      newNameEditedRef.current = false;
      refreshSessions();
      return invoke("open_session", { sessionId: session.id }).then(() => session.id);
    }).then((id) => {
      setActiveSessionId(id);
    });
  }

  function handleStartRename(session: SessionSummary) {
    setRenamingSessionId(session.id);
    setRenameValue(session.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  function handleSaveRename(sessionId: string) {
    if (renameValue.trim()) {
      invoke("rename_session", {
        sessionId,
        newName: renameValue.trim(),
      }).then(() => {
        refreshSessions();
      });
    }
    setRenamingSessionId(null);
  }

  function handleDelete(sessionId: string) {
    invoke("delete_session", { sessionId }).then(() => {
      setDeleteConfirmId(null);
      if (activeSessionId === sessionId) setActiveSessionId(null);
      refreshSessions();
    });
  }

  function handleResizeMouseDown() {
    isResizing.current = true;
    setIsResizingState(true);
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleResizeMouseMove);
    document.addEventListener("mouseup", handleResizeMouseUp);
  }

  function handleResizeMouseMove(e: MouseEvent) {
    if (!isResizing.current) return;
    const w = e.clientX;
    if (w < 60) {
      lastWidth.current = sidebarWidth > 60 ? sidebarWidth : lastWidth.current;
      setSidebarWidth(42);
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(false);
      setSidebarWidth(Math.max(200, Math.min(600, w)));
    }
  }

  function handleResizeMouseUp() {
    isResizing.current = false;
    setIsResizingState(false);
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleResizeMouseMove);
    document.removeEventListener("mouseup", handleResizeMouseUp);
  }

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMouseMove);
      document.removeEventListener("mouseup", handleResizeMouseUp);
    };
  }, []);

  useEffect(() => {
    if (sidebarCollapsed) {
      if (sidebarWidth > 42) {
        lastWidth.current = sidebarWidth;
        setSidebarWidth(42);
      }
    } else {
      if (sidebarWidth <= 42) {
        setSidebarWidth(lastWidth.current);
      }
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (contextMenu) {
        setContextMenu(null);
      } else if (deleteConfirmId) {
        setDeleteConfirmId(null);
      } else if (showNewSessionDialog) {
        setShowNewSessionDialog(false);
      } else if (renamingSessionId) {
        setRenamingSessionId(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showNewSessionDialog, deleteConfirmId, renamingSessionId, contextMenu]);

  const contextSession = contextMenu
    ? sessions.find((s) => s.id === contextMenu.sessionId)
    : null;

  async function handleOpenInFinder() {
    if (!contextSession) return;
    const path = contextSession.working_directory;
    try {
      await revealItemInDir(path);
    } catch {
      const parent = path.substring(0, path.lastIndexOf("/")) || "/";
      try {
        await revealItemInDir(parent);
      } catch {
        addToast({ type: "error", message: "Failed to open Finder" });
      }
    }
    setContextMenu(null);
  }

  async function handleCopySessionId() {
    if (!contextSession) return;
    try {
      await navigator.clipboard.writeText(contextSession.id);
    } catch {
      addToast({ type: "error", message: "Failed to copy to clipboard" });
    }
    setContextMenu(null);
  }

  async function handleCopySessionPath() {
    if (!contextSession) return;
    try {
      await navigator.clipboard.writeText(contextSession.working_directory);
    } catch {
      addToast({ type: "error", message: "Failed to copy to clipboard" });
    }
    setContextMenu(null);
  }

  async function getToolPref(key: string): Promise<string> {
    try {
      const store = await Store.load("preferences.json");
      const val = await store.get<string>(key);
      console.log(`[getToolPref] key="${key}", value="${val}"`);
      return val ?? "";
    } catch (err) {
      console.error(`[getToolPref] Failed to read "${key}":`, err);
      return "";
    }
  }

  async function launchTool(
    preferenceKey: string,
    workingDir: string,
    toolLabel: string,
    onUnconfigured?: () => void,
  ) {
    const appName = await getToolPref(preferenceKey);
    console.log(`[launchTool] ${toolLabel}: appName="${appName}", workingDir="${workingDir}"`);
    if (!appName) {
      addToast({
        type: "info",
        message: `No ${toolLabel} configured`,
        action: onUnconfigured
          ? { label: "Configure", onClick: onUnconfigured }
          : undefined,
      });
      return;
    }
    try {
      console.log(`[launchTool] Calling openPath("${workingDir}", "${appName}")`);
      await openPath(workingDir, appName);
      console.log(`[launchTool] openPath succeeded`);
    } catch (err) {
      console.error(`[launchTool] openPath failed:`, err);
      addToast({
        type: "error",
        message: `Failed to launch ${appName}. Is it installed?`,
      });
    }
  }

  function openPreferences() {
    invoke("open_preferences");
  }

  async function handleOpenInEditor() {
    if (!contextSession) return;
    await launchTool(
      "external_editor",
      contextSession.working_directory,
      "editor",
      openPreferences,
    );
    setContextMenu(null);
  }

  async function handleOpenInDiff() {
    if (!contextSession) return;
    const appName = await getToolPref("external_diff_tool");
    if (appName) {
      try {
        await openPath(contextSession.working_directory + "/.git", "Finder");
      } catch {
        addToast({
          type: "info",
          message: "Not a git repository. Diff tool may not show changes.",
        });
      }
    }
    await launchTool(
      "external_diff_tool",
      contextSession.working_directory,
      "diff tool",
      openPreferences,
    );
    setContextMenu(null);
  }

  async function handleOpenInTerminal() {
    if (!contextSession) return;
    await launchTool(
      "external_terminal",
      contextSession.working_directory,
      "terminal",
      openPreferences,
    );
    setContextMenu(null);
  }

  return (
    <>
      <aside className={`sidebar${sidebarCollapsed ? " sidebar-collapsed" : ""}${isResizingState ? " sidebar-resizing" : ""}`} style={{ width: sidebarCollapsed ? 42 : sidebarWidth }}>
        <div className="sidebar-header">
          <button
            className="sidebar-toggle-btn"
            onClick={() => {
              if (sidebarCollapsed) {
                setSidebarWidth(lastWidth.current);
                setSidebarCollapsed(false);
              } else {
                lastWidth.current = sidebarWidth;
                setSidebarWidth(42);
                setSidebarCollapsed(true);
              }
            }}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div className="sidebar-header-content">
            {activeSessionId ? (
              <button
                className="sidebar-title sidebar-title-back"
                onClick={() => {
                  invoke("close_session", { sessionId: activeSessionId }).then(() => {
                    setActiveSessionId(null);
                    refreshSessions();
                  });
                }}
                title="Back to all sessions"
                aria-label="Close session and return to all sessions"
              >
                <ArrowLeft size={14} className="sidebar-title-back-icon" />
                <span className="sidebar-title-back-label">
                  {sessions.find((s) => s.id === activeSessionId)?.name ?? "Sessions"}
                </span>
              </button>
            ) : (
              <h2 className="sidebar-title">Sessions</h2>
            )}
            <button
              className="new-session-btn"
              onClick={() => {
                setNewName("");
                setNewWorkingDir("");
                newNameEditedRef.current = false;
                setShowNewSessionDialog(true);
              }}
              title="New Session"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-view sidebar-view-expanded">
            {sessions.length === 0 ? (
              <div className="sidebar-empty">No sessions yet</div>
            ) : (
              groupKeys.map((dir) => (
                <div key={dir} className="session-group">
                  <div className="session-group-header" title={grouped[dir][0]?.working_directory ?? dir}>{dir}</div>
                  {grouped[dir].map((s) => (
                    <div
                      key={s.id}
                      className={`session-row${s.id === activeSessionId ? " active" : ""}${!s.reachable ? " unreachable" : ""}`}
                      onClick={() => handleSelect(s.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, sessionId: s.id });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelect(s.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-current={s.id === activeSessionId ? "true" : undefined}
                      title={!s.reachable ? "Directory not found" : undefined}
                    >
                    <div className="session-info">
                      <span
                        className={`session-state-dot session-state-dot-${s.state.toLowerCase()} session-state-dot-inline`}
                        aria-hidden="true"
                        title={s.state}
                      />
                      {renamingSessionId === s.id ? (
                          <input
                            ref={renameInputRef}
                            className="rename-input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleSaveRename(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(s.id);
                              if (e.key === "Escape") setRenamingSessionId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="session-name">{s.name}</span>
                        )}
                      </div>
                      <div className="session-actions">
                      <button
                        className="session-action-btn"
                        title="Rename"
                        aria-label={`Rename ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(s);
                        }}
                      >
                        &#9998;
                      </button>
                      <button
                        className="session-action-btn"
                        title="Delete"
                        aria-label={`Delete ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(s.id);
                        }}
                      >
                        &#10005;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
           )}
          </div>
          <div className="sidebar-view sidebar-view-collapsed">
            <div className="sidebar-collapsed-sessions">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  className={`sidebar-collapsed-session${s.id === activeSessionId ? " active" : ""}`}
                  onClick={() => handleSelect(s.id)}
                  title={`${s.name} — ${s.state}`}
                  aria-label={`${s.name}, ${s.state}`}
                >
                  {s.name.charAt(0).toUpperCase()}
                  <span className={`session-state-dot session-state-dot-${s.state.toLowerCase()}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sidebar-resize" onMouseDown={handleResizeMouseDown} />
      </aside>

      {showNewSessionDialog && (
        <div
          className="dialog-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewSessionDialog(false);
          }}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="dialog-title">New Session</h3>
            <div className="dialog-fields">
              <label className="dialog-label">
                Working Directory
                <button
                  type="button"
                  className={`dialog-dropzone${newWorkingDir ? " has-value" : ""}${isDragOver ? " drag-over" : ""}`}
                  autoFocus
                  onClick={async () => {
                    const selected = await open({ directory: true });
                    if (selected) applyWorkingDir(selected);
                  }}
                >
                  {newWorkingDir ? (
                    <>
                      <FolderOpen size={28} className="dialog-dropzone-icon" aria-hidden="true" />
                      <span className="dialog-dropzone-name">{folderNameOf(newWorkingDir)}</span>
                      <span className="dialog-dropzone-path" title={newWorkingDir}>{newWorkingDir}</span>
                      <span className="dialog-dropzone-hint">Drop a different folder, or click to change</span>
                    </>
                  ) : (
                    <>
                      <FolderInput size={28} className="dialog-dropzone-icon" aria-hidden="true" />
                      <span className="dialog-dropzone-title">Drag a folder here</span>
                      <span className="dialog-dropzone-hint">or click to browse</span>
                    </>
                  )}
                </button>
              </label>
              <label className="dialog-label">
                Name
                <input
                  className="dialog-input"
                  value={newName}
                  onChange={(e) => {
                    newNameEditedRef.current = true;
                    setNewName(e.target.value);
                  }}
                  placeholder="Session name"
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-cancel"
                onClick={() => setShowNewSessionDialog(false)}
              >
                Cancel
              </button>
              <button
                className="dialog-btn dialog-btn-create"
                onClick={handleCreate}
                disabled={!newName.trim() || !newWorkingDir.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div
          className="dialog-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmId(null);
          }}
        >
          <div className="dialog dialog-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-confirm-text">
              Are you sure you want to delete
              &apos;{sessions.find((s) => s.id === deleteConfirmId)?.name ?? ""}
              &apos;?
            </p>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-cancel"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                className="dialog-btn dialog-btn-delete"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="context-menu-item" onClick={handleOpenInFinder}>
              Open in Finder
            </div>
            <div className="context-menu-item" onClick={handleOpenInEditor}>
              Open in Editor
            </div>
            <div className="context-menu-item" onClick={handleOpenInDiff}>
              Open in External Diff
            </div>
            <div className="context-menu-item" onClick={handleOpenInTerminal}>
              Open in Terminal
            </div>
            <div className="context-menu-item" onClick={handleCopySessionId}>
              Copy SessionID
            </div>
            <div className="context-menu-item" onClick={handleCopySessionPath}>
              Copy Session Path
            </div>
          </div>
        </>
      )}
    </>
  );
}
