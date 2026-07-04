import { useState, useCallback, useRef } from "react";
import type { CanvasNode } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";
export interface DragState {
  nodeId: string;
  startX: number;
  startY: number;
  nodeStartX: number;
  nodeStartY: number;
  multiNodeStarts?: Map<string, { x: number; y: number }>;
}

export function useCanvasNodeDrag(params: {
  nodes: CanvasNode[];
  selectedNodeIds: Set<string>;
  zoom: number;
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
}): {
  dragState: DragState | null;
  draggedNodeId: string | null;
  handleNodeMouseDown: (nodeId: string, e: React.MouseEvent) => void;
  handleDragMove: (clientX: number, clientY: number) => void;
  handleDragEnd: () => DragState | null;
  dragThrottleRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  batchUpdatePositionsRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
} {
  const { nodes, selectedNodeIds, zoom, setNodes } = params;

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced node position update
  const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    if (dragThrottleRef.current) {
      clearTimeout(dragThrottleRef.current);
    }
    dragThrottleRef.current = setTimeout(() => {
      safeInvoke<CanvasNode>("update_canvas_node", {
        id: nodeId,
        content: null,
        x,
        y,
        width: null,
        height: null,
        metadataJson: null,
      }).catch((err) => {
        console.error("Failed to update node position:", err);
      });
    }, 100);
  }, []);

  // Batch update positions for multiple nodes (debounced)
  const batchUpdatePositionsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchUpdatePositions = useCallback((updates: { id: string; x: number; y: number }[]) => {
    if (batchUpdatePositionsRef.current) {
      clearTimeout(batchUpdatePositionsRef.current);
    }
    batchUpdatePositionsRef.current = setTimeout(() => {
      for (const { id, x, y } of updates) {
        safeInvoke<CanvasNode>("update_canvas_node", {
          id,
          content: null,
          x,
          y,
          width: null,
          height: null,
          metadataJson: null,
        }).catch((err) => {
          console.error("Failed to update node position:", err);
        });
      }
    }, 100);
  }, []);

  // Handle mouse down on a node to start dragging
  const handleNodeMouseDown = useCallback((
    nodeId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();

    // Only start drag with left mouse button
    if (e.button !== 0) return;

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Determine which nodes to drag: if node is in selection, drag all selected; otherwise just this one
    const isDraggingSelected = selectedNodeIds.has(node.id);
    const nodesToDrag = isDraggingSelected
      ? nodes.filter((n) => selectedNodeIds.has(n.id))
      : [node];

    // Store original positions for all nodes being dragged
    const multiNodeStarts = new Map<string, { x: number; y: number }>();
    for (const n of nodesToDrag) {
      multiNodeStarts.set(n.id, { x: n.x, y: n.y });
    }

    setDragState({
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      nodeStartX: node.x,
      nodeStartY: node.y,
      multiNodeStarts: nodesToDrag.length > 1 ? multiNodeStarts : undefined,
    });
    setDraggedNodeId(node.id);
  }, [selectedNodeIds, nodes]);

  // Handle drag move (called from the component's mouse move handler)
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragState) return;

    const dx = (clientX - dragState.startX) / zoom;
    const dy = (clientY - dragState.startY) / zoom;

    if (dragState.multiNodeStarts) {
      // Multi-node drag: move all selected nodes by the same delta
      const updates: { id: string; x: number; y: number }[] = [];
      setNodes((prev) =>
        prev.map((node) => {
          const startPos = dragState.multiNodeStarts!.get(node.id);
          if (startPos) {
            const newX = startPos.x + dx;
            const newY = startPos.y + dy;
            updates.push({ id: node.id, x: newX, y: newY });
            return { ...node, x: newX, y: newY };
          }
          return node;
        })
      );
      batchUpdatePositions(updates);
    } else {
      // Single node drag
      const newX = dragState.nodeStartX + dx;
      const newY = dragState.nodeStartY + dy;

      setNodes((prev) =>
        prev.map((node) =>
          node.id === dragState.nodeId
            ? { ...node, x: newX, y: newY }
            : node
        )
      );
      updateNodePosition(dragState.nodeId, newX, newY);
    }
  }, [dragState, zoom, setNodes, updateNodePosition, batchUpdatePositions]);

  // Handle drag end — clears state and returns the drag snapshot for undo recording
  const handleDragEnd = useCallback((): DragState | null => {
    if (dragThrottleRef.current) {
      clearTimeout(dragThrottleRef.current);
    }
    if (batchUpdatePositionsRef.current) {
      clearTimeout(batchUpdatePositionsRef.current);
    }

    const dragSnapshot = dragState;
    setDragState(null);
    setDraggedNodeId(null);
    return dragSnapshot;
  }, [dragState]);

  return {
    dragState,
    draggedNodeId,
    handleNodeMouseDown,
    handleDragMove,
    handleDragEnd,
    dragThrottleRef,
    batchUpdatePositionsRef,
  };
}
