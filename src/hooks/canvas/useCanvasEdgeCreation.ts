import { useState, useCallback, useRef, useEffect } from "react";
import type { CanvasNode, CanvasEdge } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";

export function useCanvasEdgeCreation(params: {
  nodes: CanvasNode[];
  selectedCanvasId: string | null;
  showToast: (message: string) => void;
  setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>;
}): {
  edgeDragState: {
    sourceNodeId: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  } | null;
  isAltPressed: boolean;
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;
  handleEdgeDragStart: (nodeId: string, x: number, y: number) => void;
  handleEdgeDragMove: (x: number, y: number) => void;
  handleEdgeDragEnd: (canvasX?: number, canvasY?: number) => void;
  setEdgeDragState: React.Dispatch<React.SetStateAction<{
    sourceNodeId: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  } | null>>;
} {
  const { nodes, selectedCanvasId, showToast, setEdges } = params;

  // Edge drag state (for creating new edges)
  const [edgeDragState, setEdgeDragState] = useState<{
    sourceNodeId: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  } | null>(null);

  // Alt key held for edge creation mode
  const isAltPressedRef = useRef(false);
  const [isAltPressed, setIsAltPressed] = useState(false);

  // Hovered node id (for connection source breathe effect)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Start edge creation (called from node mouse down with Alt key)
  const handleEdgeDragStart = useCallback((nodeId: string, x: number, y: number) => {
    setEdgeDragState({
      sourceNodeId: nodeId,
      sourceX: x,
      sourceY: y,
      targetX: x,
      targetY: y,
    });
  }, []);

  // Update edge drag position
  const handleEdgeDragMove = useCallback((canvasX: number, canvasY: number) => {
    if (!edgeDragState) return;
    setEdgeDragState((prev) => prev ? { ...prev, targetX: canvasX, targetY: canvasY } : null);
  }, [edgeDragState]);

  // Complete edge creation
  const handleEdgeDragEnd = useCallback((canvasX?: number, canvasY?: number) => {
    if (!edgeDragState) return;

    if (canvasX !== undefined && canvasY !== undefined) {
      // Check if dropped on a node
      for (const node of nodes) {
        if (node.id === edgeDragState.sourceNodeId) continue;
        if (
          canvasX >= node.x &&
          canvasX <= node.x + node.width &&
          canvasY >= node.y &&
          canvasY <= node.y + node.height
        ) {
          // Create the edge
          safeInvoke<CanvasEdge>("create_canvas_edge", {
            canvasId: selectedCanvasId,
            sourceNodeId: edgeDragState.sourceNodeId,
            targetNodeId: node.id,
            label: null,
            metadataJson: null,
          }).then((newEdge) => {
            setEdges((prev) => [...prev, newEdge]);
            showToast("Edge created");
          }).catch((err) => {
            console.error("Failed to create edge:", err);
            showToast("Failed to create edge");
          });
          break;
        }
      }
    }
    setEdgeDragState(null);
  }, [edgeDragState, nodes, selectedCanvasId, showToast, setEdges]);

  // Alt key listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        isAltPressedRef.current = true;
        setIsAltPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        isAltPressedRef.current = false;
        setIsAltPressed(false);
        setHoveredNodeId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return {
    edgeDragState,
    isAltPressed,
    hoveredNodeId,
    setHoveredNodeId,
    handleEdgeDragStart,
    handleEdgeDragMove,
    handleEdgeDragEnd,
    setEdgeDragState,
  };
}
