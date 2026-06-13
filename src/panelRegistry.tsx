import type { ComponentType } from "react";

export interface PanelProps {
  panelType: string;
}

const panelRegistry = new Map<string, ComponentType<PanelProps>>();
const labelRegistry = new Map<string, string>();

export function registerPanel(type: string, label: string, component: ComponentType<PanelProps>): void {
  panelRegistry.set(type, component);
  labelRegistry.set(type, label);
}

export function getPanel(type: string): ComponentType<PanelProps> | undefined {
  return panelRegistry.get(type);
}

export function getPanelLabel(type: string): string | undefined {
  return labelRegistry.get(type);
}

export function listPanelTypes(): { type: string; label: string }[] {
  return Array.from(labelRegistry.entries()).map(([type, label]) => ({ type, label }));
}
