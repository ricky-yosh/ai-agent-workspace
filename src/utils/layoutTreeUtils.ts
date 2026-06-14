import type { LayoutNode } from "../SplitLayout";
import { pathsEqual } from "./pathUtils";

export { pathsEqual };

export function updateRatio(node: LayoutNode, path: number[], newRatio: number): LayoutNode {
  if (path.length === 0 && "split" in node) {
    return { split: { ...node.split, ratio: newRatio } };
  }
  if ("split" in node) {
    const [idx, ...rest] = path;
    return {
      split: {
        ...node.split,
        children: node.split.children.map((child, i) =>
          i === idx ? updateRatio(child, rest, newRatio) : child
        ),
      },
    };
  }
  return node;
}

export function replaceNode(node: LayoutNode, path: number[], newNode: LayoutNode): LayoutNode {
  if (path.length === 0) return newNode;
  if (!("split" in node)) return node;
  const [idx, ...rest] = path;
  return {
    split: {
      ...node.split,
      children: node.split.children.map((child, i) =>
        i === idx ? replaceNode(child, rest, newNode) : child
      ),
    },
  };
}

export function getNodeAtPath(node: LayoutNode, path: number[]): LayoutNode | null {
  if (path.length === 0) return node;
  if (!("split" in node)) return null;
  const [idx, ...rest] = path;
  if (idx < 0 || idx >= node.split.children.length) return null;
  return getNodeAtPath(node.split.children[idx], rest);
}
