import type { LayoutNode, LayoutTree } from "../SplitLayout";

export function migrateTree(node: LayoutNode): LayoutNode {
  if ("panel" in node) {
    if (node.panel.panel_type === "terminal" && !node.panel.terminal_id) {
      return {
        panel: {
          ...node.panel,
          terminal_id: crypto.randomUUID(),
        },
      };
    }
    return node;
  }
  if ("split" in node) {
    return {
      split: {
        ...node.split,
        children: node.split.children.map(migrateTree),
      },
    };
  }
  return node;
}

export function migrateWorkspaceTree(tree: LayoutTree): LayoutTree {
  return { tree: migrateTree(tree.tree) };
}
