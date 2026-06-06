import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSessions, type SessionSummary } from "./SessionContext";
import "./SessionSidebar.css";

export default function SessionSidebar() {
  const { sessions, activeSessionId, setActiveSessionId, refreshSessions } =
    useSessions();
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkingDir, setNewWorkingDir] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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
      setShowNewDialog(false);
      setNewName("");
      setNewWorkingDir("");
      refreshSessions();
      setActiveSessionId(session.id);
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
    document.addEventListener("mousemove", handleResizeMouseMove);
    document.addEventListener("mouseup", handleResizeMouseUp);
  }

  function handleResizeMouseMove(e: MouseEvent) {
    if (!isResizing.current) return;
    const w = e.clientX;
    if (w < 60) {
      lastWidth.current = sidebarWidth > 60 ? sidebarWidth : lastWidth.current;
      setSidebarWidth(42);
      setCollapsed(true);
    } else {
      setCollapsed(false);
      setSidebarWidth(Math.max(200, Math.min(600, w)));
    }
  }

  function handleResizeMouseUp() {
    isResizing.current = false;
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
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (deleteConfirmId) {
        setDeleteConfirmId(null);
      } else if (showNewDialog) {
        setShowNewDialog(false);
      } else if (renamingSessionId) {
        setRenamingSessionId(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showNewDialog, deleteConfirmId, renamingSessionId]);

  return (
    <>
      <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`} style={collapsed ? undefined : { width: sidebarWidth }}>
        <div className="sidebar-header">
          <button
            className="sidebar-toggle-btn"
            onClick={() => {
              if (collapsed) {
                setSidebarWidth(lastWidth.current);
                setCollapsed(false);
              } else {
                lastWidth.current = sidebarWidth;
                setSidebarWidth(42);
                setCollapsed(true);
              }
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="1" y="2" width="5" height="12" rx="1.5" fill="currentColor"/>
            </svg>
          </button>
          {!collapsed && (
            <h2
              className="sidebar-title sidebar-title-home"
              onClick={() => {
                if (activeSessionId) {
                  invoke("close_session", { sessionId: activeSessionId }).then(() => {
                    setActiveSessionId(null);
                    refreshSessions();
                  });
                }
              }}
              title="Back to home"
            >
              Sessions
            </h2>
          )}
          {!collapsed && (
            <button
              className="new-session-btn"
              onClick={() => setShowNewDialog(true)}
              title="New Session"
            >
              +
            </button>
          )}
        </div>

        {collapsed && (
          <div className="sidebar-collapsed-sessions">
            {sessions.map((s) => (
              <button
                key={s.id}
                className={`sidebar-collapsed-session${s.id === activeSessionId ? " active" : ""}`}
                onClick={() => handleSelect(s.id)}
                title={s.name}
              >
                {s.name.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {!collapsed && (
          <div className="sidebar-list">
            {sessions.length === 0 ? (
              <div className="sidebar-empty">No sessions yet</div>
            ) : (
              groupKeys.map((dir) => (
                <div key={dir} className="session-group">
                  <div className="session-group-header">{dir}</div>
                  {grouped[dir].map((s) => (
                    <div
                      key={s.id}
                      className={`session-row${s.id === activeSessionId ? " active" : ""}${!s.reachable ? " unreachable" : ""}`}
                      onClick={() => handleSelect(s.id)}
                      title={!s.reachable ? "Directory not found" : undefined}
                    >
                    <div className="session-info">
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
        )}

        <div className={`sidebar-resize${collapsed ? " sidebar-resize-collapsed" : ""}`} onMouseDown={handleResizeMouseDown} />
      </aside>

      {showNewDialog && (
        <div
          className="dialog-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewDialog(false);
          }}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="dialog-title">New Session</h3>
            <div className="dialog-fields">
              <label className="dialog-label">
                Name
                <input
                  className="dialog-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Session name"
                  autoFocus
                />
              </label>
              <label className="dialog-label">
                Working Directory
                <div className="dialog-dir-picker">
                  <input
                    className="dialog-input dialog-dir-input"
                    value={newWorkingDir}
                    readOnly
                    placeholder="Select a directory"
                  />
                  <button
                    className="dialog-dir-btn"
                    onClick={async () => {
                      const selected = await open({ directory: true });
                      if (selected) setNewWorkingDir(selected);
                    }}
                  >
                    Browse…
                  </button>
                </div>
              </label>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-cancel"
                onClick={() => setShowNewDialog(false)}
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
    </>
  );
}
