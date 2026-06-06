import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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

  const renameInputRef = useRef<HTMLInputElement>(null);
  const isResizing = useRef(false);

  const grouped = sessions.reduce<Record<string, SessionSummary[]>>(
    (acc, s) => {
      const dir = s.working_directory;
      if (!acc[dir]) acc[dir] = [];
      acc[dir].push(s);
      return acc;
    },
    {},
  );
  const groupKeys = Object.keys(grouped).sort();

  function handleSelect(id: string) {
    if (id === activeSessionId) {
      invoke("close_session", { sessionId: id }).then(() => {
        setActiveSessionId(null);
        refreshSessions();
      });
    } else {
      invoke("open_session", { sessionId: id }).then(() => {
        setActiveSessionId(id);
        refreshSessions();
      });
    }
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
    setSidebarWidth(Math.max(200, Math.min(600, e.clientX)));
  }

  function handleResizeMouseUp() {
    isResizing.current = false;
    document.removeEventListener("mousemove", handleResizeMouseMove);
    document.removeEventListener("mouseup", handleResizeMouseUp);
  }

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
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">Sessions</h2>
          <button
            className="new-session-btn"
            onClick={() => setShowNewDialog(true)}
            title="New Session"
          >
            +
          </button>
        </div>

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
                      <span className="session-state-dot" data-state={s.state} />
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

        <div className="sidebar-resize" onMouseDown={handleResizeMouseDown} />
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
                <input
                  className="dialog-input"
                  value={newWorkingDir}
                  onChange={(e) => setNewWorkingDir(e.target.value)}
                  placeholder="/path/to/project"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
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
