import { createContext, useContext } from "react";

export interface PanelContextType {
  workspaceId: string;
  sessionId: string;
  areaId: string;
  terminalId: string | null;
  focusedAreaId: string | null;
}

export const PanelContext = createContext<PanelContextType | null>(null);

export function usePanelContext(): PanelContextType {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanelContext must be used within PanelContext.Provider");
  return ctx;
}
