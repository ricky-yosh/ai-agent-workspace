import type { ComponentType } from "react";

export interface PanelProps {
  panelType: string;
}

const panelRegistry = new Map<string, ComponentType<PanelProps>>();

export function registerPanel(type: string, component: ComponentType<PanelProps>): void {
  panelRegistry.set(type, component);
}

export function getPanel(type: string): ComponentType<PanelProps> | undefined {
  return panelRegistry.get(type);
}
