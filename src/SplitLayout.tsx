import { useState, useRef } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { getPanel } from "./panelRegistry";
import "./SplitLayout.css";
import "./ContextMenu.css";

interface SplitData {
  direction: "vertical" | "horizontal";
  ratio: number;
  children: LayoutNode[];
}

interface PanelData {
  panel_type: string;
}

type LayoutNode =
  | { split: SplitData }
  | { panel: PanelData };

export interface LayoutTree {
  tree: LayoutNode;
}

export interface Layout {
  id: string;
  name: string;
  tree: LayoutTree;
}

interface SplitLayoutProps {
  tree: LayoutTree;
  onLayoutChange?: (tree: LayoutTree) => void;
  focusedPath?: number[] | null;
  onFocusedPathChange?: (path: number[]) => void;
  zoomedPath?: number[] | null;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: number[];
}

function updateRatio(node: LayoutNode, path: number[], newRatio: number): LayoutNode {
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

function replaceNode(node: LayoutNode, path: number[], newNode: LayoutNode): LayoutNode {
  if (path.length === 0 || !("split" in node)) return newNode;
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

function pathsEqual(a: number[] | null | undefined, b: number[] | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function getNodeAtPath(node: LayoutNode, path: number[]): LayoutNode | null {
  if (path.length === 0) return node;
  if (!("split" in node)) return null;
  const [idx, ...rest] = path;
  if (idx < 0 || idx >= node.split.children.length) return null;
  return getNodeAtPath(node.split.children[idx], rest);
}

export default function SplitLayout({ tree, onLayoutChange, focusedPath, onFocusedPathChange, zoomedPath }: SplitLayoutProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;

  if (zoomedPath && zoomedPath.length > 0) {
    const zoomedNode = getNodeAtPath(tree.tree, zoomedPath);
    if (zoomedNode) return <div className="split-layout">{renderNode(zoomedNode)}</div>;
  }

  function renderNode(node: LayoutNode, path: number[] = []): React.ReactNode {
    if ("split" in node) {
      const { direction, ratio, children } = node.split;
      const firstSize = Math.round(ratio * 100);
      const sizes = [firstSize, 100 - firstSize];
      const panes = children.slice(0, 2);
      function handleDragEnd(sizes: number[]) {
        if (!onLayoutChange) return;
        const newRatio = sizes[0] / (sizes[0] + sizes[1]);
        const updatedTree: LayoutTree = {
          tree: updateRatio(treeRef.current.tree, path, newRatio),
        };
        onLayoutChange(updatedTree);
      }

      const splitKey = `${JSON.stringify(path)}-${ratio}`;
      return (
        <Allotment key={splitKey} vertical={direction === "horizontal"} defaultSizes={sizes} onDragEnd={handleDragEnd} minSize={50}>
          {panes.map((child, i) => (
            <div key={i} className="split-layout-pane">
              {renderNode(child, [...path, i])}
            </div>
          ))}
        </Allotment>
      );
    }

    const { panel_type } = node.panel;
    const PanelComponent = getPanel(panel_type);
    if (PanelComponent) {
      return (
        <div
          className={`split-layout-panel-wrapper${pathsEqual(focusedPath, path) ? " focused" : ""}`}
          onMouseDown={() => onFocusedPathChange?.(path)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, path });
          }}
        >
          <PanelComponent panelType={panel_type} />
        </div>
      );
    }
    return <div className="split-layout-unknown">{panel_type}</div>;
  }

  function handleSplit(direction: "vertical" | "horizontal") {
    if (!contextMenu || !onLayoutChange) return;

    const newNode: LayoutNode = {
      split: {
        direction,
        ratio: 0.5,
        children: [
          { panel: { panel_type: "blank" } },
          { panel: { panel_type: "blank" } },
        ],
      },
    };

    const newTree: LayoutTree = {
      tree: replaceNode(treeRef.current.tree, contextMenu.path, newNode),
    };

    onLayoutChange(newTree);
    setContextMenu(null);
  }

  return (
    <div className="split-layout">
      {renderNode(tree.tree)}
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="context-menu-item" onClick={() => handleSplit("vertical")}>
              Split Vertical
            </div>
            <div className="context-menu-item" onClick={() => handleSplit("horizontal")}>
              Split Horizontal
            </div>
          </div>
        </>
      )}
    </div>
  );
}
