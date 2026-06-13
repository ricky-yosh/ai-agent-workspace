import { useState, useRef, useEffect } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { getPanel } from "./panelRegistry";
import PanelTypeSelector from "./PanelTypeSelector";
import SashContextMenu from "./SashContextMenu";
import "./SplitLayout.css";

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
  interface SplitDragState {
    path: number[];
    corner: "tl" | "tr" | "bl" | "br";
    direction: "vertical" | "horizontal";
    rect: { left: number; top: number; width: number; height: number };
    startX: number;
    startY: number;
    cursorX: number;
    cursorY: number;
    dragDistance: number;
  }

  function computeDirection(
    corner: "tl" | "tr" | "bl" | "br",
    relX: number,
    relY: number
  ): "vertical" | "horizontal" {
    switch (corner) {
      case "tl": return relX > relY ? "vertical" : "horizontal";
      case "tr": return (1 - relX) > relY ? "vertical" : "horizontal";
      case "bl": return relX > (1 - relY) ? "vertical" : "horizontal";
      case "br": return (1 - relX) > (1 - relY) ? "vertical" : "horizontal";
    }
  }

  interface JoinState {
    splitPath: number[];
    consumerIndex: 0 | 1;
    direction: "vertical" | "horizontal";
    inCancelZone: boolean;
  }

  const [splitDrag, setSplitDrag] = useState<SplitDragState | null>(null);
  const splitDragRef = useRef<SplitDragState | null>(null);

  const [joinState, setJoinState] = useState<JoinState | null>(null);
  const joinStateRef = useRef<JoinState | null>(null);
  function cleanupJoinMode() {
    document.body.style.cursor = "";
    joinStateRef.current = null;
    setJoinState(null);
  }

  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;
  const treeRef = useRef(tree);
  treeRef.current = tree;

  useEffect(() => {
    if (!splitDrag) return;
    const handleMouseMove = (e: MouseEvent) => {
      const state = splitDragRef.current;
      if (!state) return;
      const relX = (e.clientX - state.rect.left) / state.rect.width;
      const relY = (e.clientY - state.rect.top) / state.rect.height;
      const newDirection = computeDirection(state.corner, relX, relY);
      const ddx = e.clientX - state.startX;
      const ddy = e.clientY - state.startY;
      const dragDistance = Math.sqrt(ddx * ddx + ddy * ddy);
      if (newDirection !== state.direction || dragDistance !== state.dragDistance || e.clientX !== state.cursorX || e.clientY !== state.cursorY) {
        splitDragRef.current = {
          ...state,
          direction: newDirection,
          dragDistance,
          cursorX: e.clientX,
          cursorY: e.clientY,
        };
        setSplitDrag((prev) =>
          prev ? { ...prev, direction: newDirection, dragDistance, cursorX: e.clientX, cursorY: e.clientY } : null
        );
      }
    };
    const handleMouseUp = () => {
      const state = splitDragRef.current;
      const onChange = onLayoutChangeRef.current;
      if (!state || !onChange) return;
      const { path, direction, rect, startX, startY, cursorX, cursorY } = state;

      const dx = cursorX - startX;
      const dy = cursorY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 24) {
        splitDragRef.current = null;
        setSplitDrag(null);
        return;
      }

      const relX = (cursorX - rect.left) / rect.width;
      const relY = (cursorY - rect.top) / rect.height;
      const ratio = Math.max(0.1, Math.min(0.9, direction === "vertical" ? relX : relY));
      const parentNode = getNodeAtPath(treeRef.current.tree, path);
      const parentPanelType =
        parentNode && "panel" in parentNode ? parentNode.panel.panel_type : "blank";
      const newNode: LayoutNode = {
        split: {
          direction,
          ratio,
          children: [
            { panel: { panel_type: parentPanelType } },
            { panel: { panel_type: parentPanelType } },
          ],
        },
      };
      const newTree: LayoutTree = {
        tree: replaceNode(treeRef.current.tree, path, newNode),
      };
      onChange(newTree);
      splitDragRef.current = null;
      setSplitDrag(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        splitDragRef.current = null;
        setSplitDrag(null);
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (splitDragRef.current) {
        e.preventDefault();
        splitDragRef.current = null;
        setSplitDrag(null);
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [splitDrag]);

  useEffect(() => {
    if (!joinState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const state = joinStateRef.current;
      if (!state || !onLayoutChangeRef.current) return;

      const container = document.querySelector(
        `[data-split-path='${JSON.stringify(state.splitPath)}']`
      );
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const splitNode = getNodeAtPath(treeRef.current.tree, state.splitPath);
      if (!splitNode || !("split" in splitNode)) return;

      const { direction, ratio } = splitNode.split;
      let newConsumerIndex: 0 | 1;

      if (direction === "vertical") {
        const borderX = rect.left + rect.width * ratio;
        newConsumerIndex = e.clientX < borderX ? 0 : 1;
      } else {
        const borderY = rect.top + rect.height * ratio;
        newConsumerIndex = e.clientY < borderY ? 0 : 1;
      }

      const dividerX = rect.left + rect.width * ratio;
      const dividerY = rect.top + rect.height * ratio;
      const distToDivider =
        direction === "vertical" ? Math.abs(e.clientX - dividerX) : Math.abs(e.clientY - dividerY);
      const inCancelZone = distToDivider < 24;

      if (newConsumerIndex !== state.consumerIndex || inCancelZone !== state.inCancelZone) {
        joinStateRef.current = { ...state, consumerIndex: newConsumerIndex, inCancelZone };
        setJoinState((prev) =>
          prev ? { ...prev, consumerIndex: newConsumerIndex, inCancelZone } : null
        );
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const state = joinStateRef.current;
      const onChange = onLayoutChangeRef.current;
      if (!state || !onChange) return;

      const splitNode = getNodeAtPath(treeRef.current.tree, state.splitPath);
      if (!splitNode || !("split" in splitNode)) {
        cleanupJoinMode();
        return;
      }

      const container = document.querySelector(
        `[data-split-path='${JSON.stringify(state.splitPath)}']`
      );
      if (container) {
        const rect = container.getBoundingClientRect();
        const { direction, ratio } = splitNode.split;
        const dividerX = rect.left + rect.width * ratio;
        const dividerY = rect.top + rect.height * ratio;
        const distToDivider =
          direction === "vertical" ? Math.abs(e.clientX - dividerX) : Math.abs(e.clientY - dividerY);
        if (distToDivider < 24) {
          cleanupJoinMode();
          return;
        }
      }

      const keepIndex: 0 | 1 = state.consumerIndex === 0 ? 1 : 0;
      const survivingChild = splitNode.split.children[keepIndex];
      const survivingType =
        "panel" in survivingChild ? survivingChild.panel.panel_type : "blank";
      const panelNode: LayoutNode = { panel: { panel_type: survivingType } };
      const newTree: LayoutTree = {
        tree: replaceNode(treeRef.current.tree, state.splitPath, panelNode),
      };

      onChange(newTree);
      cleanupJoinMode();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanupJoinMode();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (joinStateRef.current) {
        e.preventDefault();
        cleanupJoinMode();
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [joinState]);

  if (zoomedPath && zoomedPath.length > 0) {
    const zoomedNode = getNodeAtPath(tree.tree, zoomedPath);
    if (zoomedNode) return <div className="split-layout">{renderNode(zoomedNode)}</div>;
  }

  function handleCornerDragStart(
    e: React.MouseEvent,
    dragPath: number[],
    corner: "tl" | "tr" | "bl" | "br"
  ) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget.parentElement!;
    const r = el.getBoundingClientRect();
    const relX = (e.clientX - r.left) / r.width;
    const relY = (e.clientY - r.top) / r.height;
    const dragState: SplitDragState = {
      path: dragPath,
      corner,
      direction: computeDirection(corner, relX, relY),
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      startX: e.clientX,
      startY: e.clientY,
      cursorX: e.clientX,
      cursorY: e.clientY,
      dragDistance: 0,
    };
    document.body.style.userSelect = "none";
    splitDragRef.current = dragState;
    setSplitDrag(dragState);
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
      const isActiveJoinPanel =
        joinState && pathsEqual(joinState.splitPath, path);

      return (
        <SashContextMenu
          splitPath={path}
          onSashDoubleClick={(sp, _x, _y) => {
            const node = getNodeAtPath(treeRef.current.tree, sp);
            if (!node || !("split" in node)) return;
            const joinStateData: JoinState = {
              splitPath: sp,
              consumerIndex: 1,
              direction: node.split.direction,
              inCancelZone: false,
            };
            joinStateRef.current = joinStateData;
            setJoinState(joinStateData);
          }}
          joinArrow={
            isActiveJoinPanel && !joinState.inCancelZone
              ? { direction, consumerIndex: joinState.consumerIndex, ratio }
              : null
          }
        >
          <Allotment
            key={splitKey}
            vertical={direction === "horizontal"}
            defaultSizes={sizes}
            onDragEnd={handleDragEnd}
            minSize={50}
          >
            {panes.map((child, i) => {
              const isConsumed =
                isActiveJoinPanel && !joinState.inCancelZone && joinState.consumerIndex === i;
              return (
                <div
                  key={i}
                  className={`split-layout-pane${isConsumed ? " join-consumed" : ""}`}
                >
                  {renderNode(child, [...path, i])}
                </div>
              );
            })}
          </Allotment>
        </SashContextMenu>
      );
    }

    const { panel_type } = node.panel;
    const PanelComponent = getPanel(panel_type);

    return (
      <div
        className={`split-layout-panel-outer${pathsEqual(focusedPath, path) ? " focused" : ""}`}
        onMouseDown={() => onFocusedPathChange?.(path)}
      >
        {!splitDrag && (
          <>
            <div
              className="corner-handle corner-tl"
              onMouseDown={(e) => handleCornerDragStart(e, path, "tl")}
            />
            <div
              className="corner-handle corner-tr"
              onMouseDown={(e) => handleCornerDragStart(e, path, "tr")}
            />
            <div
              className="corner-handle corner-bl"
              onMouseDown={(e) => handleCornerDragStart(e, path, "bl")}
            />
            <div
              className="corner-handle corner-br"
              onMouseDown={(e) => handleCornerDragStart(e, path, "br")}
            />
            <PanelTypeSelector
              currentType={panel_type}
              onTypeSelect={(newType) => {
                if (!onLayoutChange) return;
                const newNode: LayoutNode = { panel: { panel_type: newType } };
                const newTree: LayoutTree = {
                  tree: replaceNode(treeRef.current.tree, path, newNode),
                };
                onLayoutChange(newTree);
              }}
            />
          </>
        )}
        <div className={`split-layout-panel-inner${PanelComponent ? "" : " split-layout-unknown"}`}>
          {PanelComponent ? (
            <PanelComponent panelType={panel_type} />
          ) : (
            panel_type
          )}
        </div>
        {splitDrag && pathsEqual(splitDrag.path, path) && splitDrag.dragDistance >= 24 && (
          <div style={{ position: "absolute", inset: 0, zIndex: 15, pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute",
                background: "var(--accent-color)",
                ...(splitDrag.direction === "vertical"
                  ? { left: `${Math.max(0, Math.min(1, (splitDrag.cursorX - splitDrag.rect.left) / splitDrag.rect.width)) * 100}%`, top: 0, width: 2, height: "100%" }
                  : { top: `${Math.max(0, Math.min(1, (splitDrag.cursorY - splitDrag.rect.top) / splitDrag.rect.height)) * 100}%`, left: 0, height: 2, width: "100%" }),
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="split-layout">
      {renderNode(tree.tree)}
    </div>
  );
}
