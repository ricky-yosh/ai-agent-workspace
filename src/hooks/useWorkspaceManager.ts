import { useState, useEffect, useCallback, useRef } from "react";
import { safeInvoke } from "../safeInvoke";
import { useSessions } from "../SessionContext";
import type { Screen } from "../types/screen";

export interface WorkspaceInstance {
  id: string;
  name: string;
  template_id: string;
  current_screen: Screen;
}

interface SessionWorkspaceData {
  workspaces: WorkspaceInstance[];
  activeWorkspace: WorkspaceInstance | null;
  loading: boolean;
}

export function useWorkspaceManager(onError?: (msg: string) => void) {
  const { sessions, activeSessionId } = useSessions();
  const [sessionData, setSessionData] = useState<Map<string, SessionWorkspaceData>>(new Map());
  const loadedSessionsRef = useRef<Set<string>>(new Set());

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
              activeWorkspace: active ?? null,
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

  /** Update local screen state without persisting (backend already persists). */
  const handleScreenChange = useCallback((workspaceId: string, newScreen: Screen) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    setSessionData(prev => {
      const next = new Map(prev);
      const sd = next.get(sid);
      if (!sd) return prev;
      next.set(sid, {
        ...sd,
        workspaces: sd.workspaces.map(w =>
          w.id === workspaceId ? { ...w, current_screen: newScreen } : w
        ),
        activeWorkspace: sd.activeWorkspace?.id === workspaceId
          ? { ...sd.activeWorkspace, current_screen: newScreen }
          : sd.activeWorkspace,
      });
      return next;
    });
  }, []);

  /** Handle a `workspace-changed` event from the backend.
   *  Routes by explicit workspace_id — never by "current active workspace". */
  const handleExternalScreenChange = useCallback((sessionId: string, workspaceId: string, newScreen: Screen) => {
    setSessionData(prev => {
      const next = new Map(prev);
      const sd = next.get(sessionId);
      const targetWs = sd?.workspaces.find(w => w.id === workspaceId);
      if (!sd) return prev;           // session not loaded yet — ignore
      if (!targetWs) {
        return prev; // workspace not in list — leave state unchanged
      }
      next.set(sessionId, {
        ...sd,
        workspaces: sd.workspaces.map(w =>
          w.id === workspaceId ? { ...w, current_screen: newScreen } : w
        ),
        activeWorkspace: sd.activeWorkspace?.id === workspaceId
          ? { ...sd.activeWorkspace, current_screen: newScreen }
          : sd.activeWorkspace,
      });
      return next;
    });
  }, []);

  const handleWorkspaceSwitch = useCallback((workspaceId: string) => {
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    safeInvoke("set_active_workspace", { sessionId: sid, workspaceId }, onError)
      .then(() => {
        return safeInvoke<WorkspaceInstance | null>("get_active_workspace", { sessionId: sid }, onError);
      })
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
    handleScreenChange,
    handleExternalScreenChange,
    handleWorkspaceSwitch,
    handleAddWorkspace,
    handleCloseWorkspace,
    handleRenameWorkspace,
    handleResetToTemplate,
    handleCycleWorkspace,
  };
}
