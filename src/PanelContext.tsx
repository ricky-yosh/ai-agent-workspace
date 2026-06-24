import { createContext, useContext } from "react";
import type { Screen } from "./types/screen";

export interface PanelContextType {
  workspaceId: string;
  sessionId: string;
  areaId: string;
  terminalId: string | null;
  focusedAreaId: string | null;
  onFocusedAreaChange: (areaId: string) => void;
  onScreenChange: (screen: Screen) => void;
}

export const PanelContext = createContext<PanelContextType | null>(null);

export function usePanelContext(): PanelContextType {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanelContext must be used within PanelContext.Provider");
  return ctx;
}
