import { useState, useRef, useEffect, useMemo, type RefObject } from "react";
import { PanelLeftClose, PanelLeft, Plus, ArrowLeft, FolderOpen, FolderInput, Pencil, X } from "lucide-react";
import { safeInvoke } from "./safeInvoke";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useSessions, type SessionSummary } from "./SessionContext";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Store } from "@tauri-apps/plugin-store";
import { useToast } from "./ToastContext";
import { SessionIcon } from "./SessionVisuals";
import { useEventListener } from "./hooks/useEventListener";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Dialog } from "./components/Dialog";
import SessionActionsModal from "./SessionActionsModal";
import "./SessionSidebar.css";
import "./Dialog.css";

function folderNameOf(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

async function copyToClipboard(text: string, label: string, addToast: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    addToast(`Failed to copy ${label} to clipboard`);
  }
}

function useSidebarResize(sidebarCollapsed: boolean, setSidebarCollapsed: (v: boolean) => void) {
  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState(280);
  const isResizingRef = useRef(false);
  const lastWidth = useRef(280);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizingRef.current) return;
    const w = e.clientX;
    if (w < 60) {
      setWidth((prev) => {
        lastWidth.current = prev > 60 ? prev : lastWidth.current;
        return 42;
      });
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(false);
      setWidth(Math.max(200, Math.min(600, w)));
    }
  }

  function handleMouseUp() {
    isResizingRef.current = false;
    setIsResizing(false);
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    setWidth((prev) => {
      if (sidebarCollapsed) {
        if (prev > 42) {
          lastWidth.current = prev;
          return 42;
        }
      } else {
        if (prev <= 42) {
          return lastWidth.current;
        }
      }
      return prev;
    });
  }, [sidebarCollapsed]);

  return { isResizing, handleMouseDown, width };
}

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, workingDir: string) => void;
  groupedSessions: Record<string, SessionSummary[]>;
}

function NewSessionDialog({ open, onClose, onCreate, groupedSessions }: NewSessionDialogProps) {
  const [name, setName] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const nameEditedRef = useRef(false);

  function applyWorkingDir(path: string) {
    setWorkingDir(path);
    if (!nameEditedRef.current) {
      setName(folderNameOf(path));
    }
  }

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (open) {
      setName("");
      setWorkingDir("");
      nameEditedRef.current = false;
    }
  }, [open]);

  const uniqueDirs = useMemo(() => {
    const seen = new Set<string>();
    const dirs: string[] = [];
    for (const [, sessions] of Object.entries(groupedSessions)) {
      for (const s of sessions) {
        if (!seen.has(s.working_directory)) {
          seen.add(s.working_directory);
          dirs.push(s.working_directory);
        }
      }
    }
    return dirs;
  }, [groupedSessions]);

  return (
    <Dialog open={open} onClose={onClose} title="New Session">
      <div className="dialog-fields">
        <label className="dialog-label">
          Working Directory
          <button
            type="button"
            className={`dialog-dropzone${workingDir ? " has-value" : ""}${isDragOver ? " drag-over" : ""}`}
            autoFocus
            onClick={async () => {
              const selected = await openDialog({ directory: true });
              if (selected) applyWorkingDir(selected);
            }}
          >
            {workingDir ? (
              <>
                <FolderOpen size={28} className="dialog-dropzone-icon" aria-hidden="true" />
                <span className="dialog-dropzone-name">{folderNameOf(workingDir)}</span>
                <span className="dialog-dropzone-path" title={workingDir}>{workingDir}</span>
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
        {uniqueDirs.length > 0 && (
          <label className="dialog-label">
            Recent directories
            <select
              className="dialog-input"
              value=""
              onChange={(e) => {
                if (e.target.value) applyWorkingDir(e.target.value);
              }}
            >
              <option value="" disabled>Select a recent directory...</option>
              {uniqueDirs.map((dir) => (
                <option key={dir} value={dir}>{dir}</option>
              ))}
            </select>
          </label>
        )}
        <label className="dialog-label">
          Name
          <input
            className="dialog-input"
            value={name}
            onChange={(e) => {
              nameEditedRef.current = true;
              setName(e.target.value);
            }}
            placeholder="Session name"
          />
        </label>
      </div>
      <div className="dialog-actions">
        <button
          className="dialog-btn dialog-btn-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="dialog-btn dialog-btn-create"
          onClick={() => onCreate(name.trim(), workingDir.trim())}
          disabled={!name.trim() || !workingDir.trim()}
        >
          Create
        </button>
      </div>
    </Dialog>
  );
}

export default function SessionSidebar({ openActionsRef, closeActionsRef }: { openActionsRef?: RefObject<((sessionId: string) => void) | null>; closeActionsRef?: RefObject<(() => void) | null> }) {
  const {
    sessions, activeSessionId, setActiveSessionId, refreshSessions,
    showNewSessionDialog, setShowNewSessionDialog,
    sidebarCollapsed, setSidebarCollapsed,
  } = useSessions();
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [sessionActionsId, setSessionActionsId] = useState<string | null>(null);

  const { addToast } = useToast();
  const renameInputRef = useRef<HTMLInputElement>(null);

  const { isResizing, handleMouseDown, width: sidebarWidth } = useSidebarResize(sidebarCollapsed, setSidebarCollapsed);

  useEffect(() => {
    if (openActionsRef) openActionsRef.current = (id) => setSessionActionsId(prev => prev === id ? null : id);
    return () => { if (openActionsRef) openActionsRef.current = null; };
  }, [openActionsRef]);

  useEffect(() => {
    if (closeActionsRef) closeActionsRef.current = () => setSessionActionsId(null);
    return () => { if (closeActionsRef) closeActionsRef.current = null; };
  }, [closeActionsRef]);

  const grouped = useMemo(() => sessions.reduce<Record<string, SessionSummary[]>>(
    (acc, s) => {
      const parts = s.working_directory.replace(/\/$/, "").split("/");
      const folder = parts[parts.length - 1] || s.working_directory;
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(s);
      return acc;
    },
    {},
  ), [sessions]);
  const groupKeys = Object.keys(grouped).sort();

  function handleCreate(name: string, workingDir: string) {
    if (!name || !workingDir) return;
    safeInvoke<SessionSummary>("create_session", {
      workingDir,
      name,
    }, (msg) => addToast({ type: "error", message: msg })).then((session) => {
      setShowNewSessionDialog(false);
      refreshSessions();
      return safeInvoke("open_session", { sessionId: session.id }, (msg) => addToast({ type: "error", message: msg })).then(() => session.id);
    }).then((id) => {
      setActiveSessionId(id);
    }).catch(console.error);
  }

  function handleSelect(id: string) {
    if (id === activeSessionId) return;
    safeInvoke("open_session", { sessionId: id }, (msg) => addToast({ type: "error", message: msg })).then(() => {
      setActiveSessionId(id);
      refreshSessions();
    }).catch(console.error);
  }

  function handleStartRename(session: SessionSummary) {
    setRenamingSessionId(session.id);
    setRenameValue(session.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  function handleSaveRename(sessionId: string) {
    if (renameValue.trim()) {
      safeInvoke("rename_session", {
        sessionId,
        newName: renameValue.trim(),
      }, (msg) => addToast({ type: "error", message: msg })).then(() => {
        refreshSessions();
      }).catch(console.error);
    }
    setRenamingSessionId(null);
  }

  function handleDelete(sessionId: string) {
    safeInvoke("delete_session", { sessionId }, (msg) => addToast({ type: "error", message: msg })).then(() => {
      setDeleteConfirmId(null);
      if (activeSessionId === sessionId) setActiveSessionId(null);
      refreshSessions();
    }).catch(console.error);
  }

  useEventListener(document, "keydown", (e) => {
    if (e.key !== "Escape") return;
    if (sessionActionsId) {
      setSessionActionsId(null);
    } else if (deleteConfirmId) {
      setDeleteConfirmId(null);
    } else if (showNewSessionDialog) {
      setShowNewSessionDialog(false);
    } else if (renamingSessionId) {
      setRenamingSessionId(null);
    }
  }, [showNewSessionDialog, deleteConfirmId, renamingSessionId, sessionActionsId]);

  const contextSession = sessionActionsId
    ? sessions.find((s) => s.id === sessionActionsId)
    : null;

  async function handleOpenInFinder() {
    if (!contextSession) return;
    const path = contextSession.working_directory;
    try {
      await revealItemInDir(path);
      addToast({ type: "info", message: "Opening Finder..." });
    } catch {
      const parent = path.substring(0, path.lastIndexOf("/")) || "/";
      try {
        await revealItemInDir(parent);
        addToast({ type: "info", message: "Opening Finder..." });
      } catch {
        addToast({ type: "error", message: "Failed to open Finder" });
      }
    }
    setSessionActionsId(null);
  }

  async function handleCopySessionId() {
    if (!contextSession) return;
    await copyToClipboard(contextSession.id, "session ID", (msg) => addToast({ type: "error", message: msg }));
    setSessionActionsId(null);
  }

  async function handleCopySessionPath() {
    if (!contextSession) return;
    await copyToClipboard(contextSession.working_directory, "path", (msg) => addToast({ type: "error", message: msg }));
    setSessionActionsId(null);
  }

  async function getToolPref(key: string): Promise<string> {
    try {
      const store = await Store.load("preferences.json");
      const val = await store.get<string>(key);
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
      await safeInvoke("open_in_app", { path: workingDir, appName });
      addToast({
        type: "info",
        message: `Launching ${appName}...`,
      });
    } catch (err) {
      console.error(`[launchTool] invoke failed:`, err);
      addToast({
        type: "error",
        message: `Failed to launch ${appName}. Is it installed?`,
      });
    }
  }

  function openPreferences() {
    safeInvoke("open_preferences", undefined, (msg) => addToast({ type: "error", message: msg })).catch(() => {});
  }

  async function handleOpenInEditor() {
    if (!contextSession) return;
    await launchTool(
      "external_editor",
      contextSession.working_directory,
      "editor",
      openPreferences,
    );
    setSessionActionsId(null);
  }

  async function handleOpenInDiff() {
    if (!contextSession) return;
    const isGit = await safeInvoke<boolean>("is_git_repo", { path: contextSession.working_directory }, (msg) => addToast({ type: "error", message: msg }));
    if (!isGit) {
      addToast({
        type: "info",
        message: "Not a git repository. Diff tool may not show changes.",
      });
    }
    await launchTool(
      "external_diff_tool",
      contextSession.working_directory,
      "diff tool",
      openPreferences,
    );
    setSessionActionsId(null);
  }

  async function handleOpenInTerminal() {
    if (!contextSession) return;
    await launchTool(
      "external_terminal",
      contextSession.working_directory,
      "terminal",
      openPreferences,
    );
    setSessionActionsId(null);
  }

  return (
    <>
      <aside className={`sidebar${sidebarCollapsed ? " sidebar-collapsed" : ""}${isResizing ? " sidebar-resizing" : ""}`} style={{ width: sidebarCollapsed ? 42 : sidebarWidth }}>
        <div className="sidebar-header">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <div className="sidebar-header-content">
            {activeSessionId ? (
              <button
                className="sidebar-title sidebar-title-back"
                onClick={() => {
                  const sid = activeSessionId;
                  setActiveSessionId(null);
                  if (sid) {
                    safeInvoke("close_session", { sessionId: sid }, (msg) => addToast({ type: "error", message: msg })).then(() => {
                      refreshSessions();
                    }).catch(console.error);
                  }
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
              onClick={() => setShowNewSessionDialog(true)}
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
                        setSessionActionsId(s.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSelect(s.id);
                        } else if (e.key === " ") {
                          e.preventDefault();
                          setSessionActionsId(s.id);
                        } else if (e.key === "Delete" || e.key === "Backspace") {
                          e.preventDefault();
                          setDeleteConfirmId(s.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-current={s.id === activeSessionId ? "true" : undefined}
                      title={!s.reachable ? "Directory not found" : undefined}
                    >
                    <div className="session-info">
                      <SessionIcon
                        sessionId={s.id}
                        projectType={s.project_type}
                        size={18}
                      />
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
                        <Pencil size={13} />
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
                        <X size={13} />
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
                  <SessionIcon
                    sessionId={s.id}
                    projectType={s.project_type}
                    size={22}
                  />
                  <span className={`session-state-dot session-state-dot-${s.state.toLowerCase()}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>

      </aside>

      <div
        className={`sidebar-resize${isResizing ? " sidebar-resize-active" : ""}`}
        style={{ left: 8 + (sidebarCollapsed ? 42 : sidebarWidth) }}
        onMouseDown={handleMouseDown}
      />

      {showNewSessionDialog && (
        <NewSessionDialog
          open={showNewSessionDialog}
          onClose={() => setShowNewSessionDialog(false)}
          onCreate={handleCreate}
          groupedSessions={grouped}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Session"
        message={`Are you sure you want to delete '${sessions.find((s) => s.id === deleteConfirmId)?.name ?? ""}'?`}
        confirmLabel="Delete"
        onConfirm={() => handleDelete(deleteConfirmId!)}
        destructive
      />

      <SessionActionsModal
        open={sessionActionsId !== null}
        onClose={() => setSessionActionsId(null)}
        session={contextSession ?? null}
        onOpenInFinder={handleOpenInFinder}
        onOpenInEditor={handleOpenInEditor}
        onOpenInDiff={handleOpenInDiff}
        onOpenInTerminal={handleOpenInTerminal}
        onCopyId={handleCopySessionId}
        onCopyPath={handleCopySessionPath}
      />
    </>
  );
}
