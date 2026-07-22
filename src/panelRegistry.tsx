import type { ComponentType } from "react";

export interface PanelProps {
  panelType: string;
}

export interface PanelTypeEntry {
  type: string;
  label: string;
}

export interface DividerEntry {
  type: "divider";
}

export type PanelListItem = PanelTypeEntry | DividerEntry;

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

export function listPanelTypes(): PanelListItem[] {
  const order = ["terminal", "file-tree", "file-viewer", "diff-viewer", "git-tree", "issue-tracker", "visual-canvas", "c4-diagram", "blank"];
  const items: PanelListItem[] = [];
  for (const type of order) {
    const label = labelRegistry.get(type);
    if (!label) continue;
    if (type === "blank") {
      items.push({ type: "divider" });
    }
    items.push({ type, label });
  }
  return items;
}
