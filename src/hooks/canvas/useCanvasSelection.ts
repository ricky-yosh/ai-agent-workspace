import { useState, useCallback, useRef } from "react";
import type { CanvasNode } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";
import type { CanvasCommand } from "./types";

export function useCanvasSelection(params: {
  nodes: CanvasNode[];
  offsetX: number;
  offsetY: number;
  zoom: number;
  pushUndo: (command: CanvasCommand) => void;
}): {
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  deletingNodeIds: Set<string>;
  setDeletingNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  boxSelect: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;
  setBoxSelect: React.Dispatch<React.SetStateAction<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>>;
  justCompletedBoxSelectRef: React.MutableRefObject<boolean>;
  handleNodeClick: (nodeId: string, e: React.MouseEvent) => void;
  handleBoxSelectMove: (viewportX: number, viewportY: number) => void;
  handleBoxSelectEnd: () => void;
  deleteSelectedNodes: () => void;
} {
  const { nodes, offsetX, offsetY, zoom, pushUndo } = params;

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [deletingNodeIds, setDeletingNodeIds] = useState<Set<string>>(new Set());

  // Box-select (rubber band) state
  const [boxSelect, setBoxSelect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  // Flag to prevent handleCanvasClick from clearing selection after box-select
  const justCompletedBoxSelectRef = useRef(false);

  // Handle node click to select
  const handleNodeClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      // Shift+click: toggle this node in the selection
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    } else {
      // Regular click: select only this node
      setSelectedNodeIds(new Set([nodeId]));
    }
  }, []);

  // Box-select: update rubber band on mouse move
  const handleBoxSelectMove = useCallback((viewportX: number, viewportY: number) => {
    if (!boxSelect) return;
    setBoxSelect((prev) => prev ? { ...prev, endX: viewportX, endY: viewportY } : null);
  }, [boxSelect]);

  // Box-select: complete selection on mouse up
  const handleBoxSelectEnd = useCallback(() => {
    if (!boxSelect) return;

    // Convert box coordinates (viewport-relative) to canvas coordinates
    const left = (Math.min(boxSelect.startX, boxSelect.endX) - offsetX) / zoom;
    const top = (Math.min(boxSelect.startY, boxSelect.endY) - offsetY) / zoom;
    const right = (Math.max(boxSelect.startX, boxSelect.endX) - offsetX) / zoom;
    const bottom = (Math.max(boxSelect.startY, boxSelect.endY) - offsetY) / zoom;

    // Only select if the box has meaningful size (dragged at least 5px)
    const boxWidth = Math.abs(boxSelect.endX - boxSelect.startX);
    const boxHeight = Math.abs(boxSelect.endY - boxSelect.startY);

    if (boxWidth > 5 || boxHeight > 5) {
      // Select nodes that intersect with the selection rectangle
      const newSelection = new Set<string>();
      for (const node of nodes) {
        const nodeRight = node.x + node.width;
        const nodeBottom = node.y + node.height;
        // Check intersection: node overlaps with selection rectangle
        if (node.x < right && nodeRight > left && node.y < bottom && nodeBottom > top) {
          newSelection.add(node.id);
        }
      }
      setSelectedNodeIds(newSelection);
    }

    setBoxSelect(null);
    // Set a flag to prevent handleCanvasClick from clearing selection
    justCompletedBoxSelectRef.current = true;
    setTimeout(() => { justCompletedBoxSelectRef.current = false; }, 50);
  }, [boxSelect, offsetX, offsetY, zoom, nodes]);

  // Delete selected node(s)
  const deleteSelectedNodes = useCallback(async () => {
    if (selectedNodeIds.size === 0) return;
    const nodeIdsToDelete = [...selectedNodeIds];
    const nodesToDelete = nodeIdsToDelete
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is CanvasNode => n !== undefined);
    if (nodesToDelete.length === 0) return;

    // Start fade-out animation
    setDeletingNodeIds((prev) => {
      const next = new Set(prev);
      for (const id of nodeIdsToDelete) next.add(id);
      return next;
    });
    setSelectedNodeIds(new Set());

    try {
      for (const node of nodesToDelete) {
        await safeInvoke("delete_canvas_node", { id: node.id });
        pushUndo({ type: "delete_node", node });
      }
    } catch (err) {
      console.error("Failed to delete nodes:", err);
    }

    // Remove from deleting set after animation completes
    setTimeout(() => {
      setDeletingNodeIds((prev) => {
        const next = new Set(prev);
        for (const id of nodeIdsToDelete) next.delete(id);
        return next;
      });
    }, 260); // Match animation duration
  }, [selectedNodeIds, nodes, pushUndo]);

  return {
    selectedNodeIds,
    setSelectedNodeIds,
    deletingNodeIds,
    setDeletingNodeIds,
    boxSelect,
    setBoxSelect,
    justCompletedBoxSelectRef,
    handleNodeClick,
    handleBoxSelectMove,
    handleBoxSelectEnd,
    deleteSelectedNodes,
  };
}
