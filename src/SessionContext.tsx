import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface SessionSummary {
  id: string;
  name: string;
  working_directory: string;
  state: "Running" | "Paused" | "Missing";
  active_layout_id: string | null;
  created_at: string;
  updated_at: string;
  reachable: boolean;
  project_type: string;
}

interface SessionContextValue {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  refreshSessions: () => Promise<void>;
  loading: boolean;
  showNewSessionDialog: boolean;
  setShowNewSessionDialog: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await invoke<SessionSummary[]>("list_sessions");
      setSessions(list);
    } catch (e) {
      console.error("[SessionContext] Failed to list sessions", e);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refreshSessions().finally(() => setLoading(false));
  }, [refreshSessions]);

  useEffect(() => {
    const unlisten = listen("sessions-changed", () => {
      refreshSessions();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [refreshSessions]);

  return (
    <SessionContext.Provider
      value={{
        sessions, activeSessionId, setActiveSessionId,
        refreshSessions, loading,
        showNewSessionDialog, setShowNewSessionDialog,
        sidebarCollapsed, setSidebarCollapsed,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessions(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessions must be used within a SessionProvider");
  return ctx;
}
