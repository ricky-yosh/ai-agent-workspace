import { createContext, useContext, useMemo } from "react";
import type { Screen } from "./types/screen";

// ---------------------------------------------------------------------------
// Identity context — static values that rarely change
// ---------------------------------------------------------------------------

export interface PanelIdentityType {
  workspaceId: string;
  sessionId: string;
  areaId: string;
  terminalId: string | null;
}

export const PanelIdentityContext = createContext<PanelIdentityType | null>(null);

export function usePanelIdentity(): PanelIdentityType {
  const ctx = useContext(PanelIdentityContext);
  if (!ctx) throw new Error("usePanelIdentity must be used within PanelIdentityContext.Provider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Focus context — dynamic values that change with focus
// ---------------------------------------------------------------------------

export interface PanelFocusType {
  focusedAreaId: string | null;
  onFocusedAreaChange: (areaId: string) => void;
  onScreenChange: (screen: Screen) => void;
}

export const PanelFocusContext = createContext<PanelFocusType | null>(null);

export function usePanelFocus(): PanelFocusType {
  const ctx = useContext(PanelFocusContext);
  if (!ctx) throw new Error("usePanelFocus must be used within PanelFocusContext.Provider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Backward-compatible combined hook
// ---------------------------------------------------------------------------

export interface PanelContextType extends PanelIdentityType, PanelFocusType {}

export function usePanelContext(): PanelContextType {
  const identity = useContext(PanelIdentityContext);
  const focus = useContext(PanelFocusContext);
  if (!identity || !focus) {
    throw new Error("usePanelContext must be used within PanelIdentityContext.Provider and PanelFocusContext.Provider");
  }
  return useMemo(() => ({ ...identity, ...focus }), [identity, focus]);
}
