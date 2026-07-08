import { useState, useCallback, useRef, useEffect } from "react";
import type { CanvasNode, CanvasEdge } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";
import { createRope, stepRope, type RopePoint } from "../../canvas/ropePhysics";
import { findNearestHandle } from "../../canvas/snapping";

type Side = "top" | "right" | "bottom" | "left";

export interface ConnectionDragState {
  sourceNodeId: string;
  sourceSide: Side;
  handleCanvasX: number;
  handleCanvasY: number;
  sourceNode: CanvasNode;
}

export function useCanvasEdgeCreation(params: {
  nodes: CanvasNode[];
  selectedCanvasId: string | null;
  showToast: (msg: string) => void;
  setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>;
  hoveredNodeId: string | null;
}): {
  connectionDrag: ConnectionDragState | null;
  ropeTarget: { x: number; y: number } | null;
  ropePoints: RopePoint[] | null;
  dragOverNodeId: string | null;
  snappedMidpoint: { x: number; y: number } | null;
  startConnectionDrag: (nodeId: string, side: Side) => void;
  updateConnectionDrag: (canvasX: number, canvasY: number) => void;
  endConnectionDrag: (canvasX: number, canvasY: number) => void;
} {
  const { nodes, selectedCanvasId, showToast, setEdges, hoveredNodeId } = params;

  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(null);
  const [ropeTarget, setRopeTarget] = useState<{ x: number; y: number } | null>(null);
  const [ropePoints, setRopePoints] = useState<RopePoint[] | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [snappedMidpoint, setSnappedMidpoint] = useState<{ x: number; y: number } | null>(null);

  const ropeRef = useRef<RopePoint[] | null>(null);
  const ropeTargetRef = useRef<{ x: number; y: number } | null>(null);
  const sourceRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const startAnimationLoop = useCallback(() => {
    const animate = (time: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = time;
      }
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.033);
      lastTimeRef.current = time;

      const rope = ropeRef.current;
      const source = sourceRef.current;
      const target = ropeTargetRef.current;
      if (rope && source && target) {
        stepRope(rope, source, target, dt);
        setRopePoints([...rope]);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const stopAnimationLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTimeRef.current = 0;
  }, []);

  const startConnectionDrag = useCallback(
    (nodeId: string, side: Side) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const cx =
        side === "left"
          ? node.x
          : side === "right"
            ? node.x + node.width
            : node.x + node.width / 2;
      const cy =
        side === "top"
          ? node.y
          : side === "bottom"
            ? node.y + node.height
            : node.y + node.height / 2;

      const source = { x: cx, y: cy };
      const rope = createRope(source, source);

      sourceRef.current = source;
      ropeRef.current = rope;
      ropeTargetRef.current = { x: cx, y: cy };

      setConnectionDrag({
        sourceNodeId: node.id,
        sourceSide: side,
        handleCanvasX: cx,
        handleCanvasY: cy,
        sourceNode: node,
      });
      setRopeTarget({ x: cx, y: cy });
      setRopePoints([...rope]);
      setDragOverNodeId(null);
      setSnappedMidpoint(null);

      startAnimationLoop();
    },
    [nodes, startAnimationLoop],
  );

  const updateConnectionDrag = useCallback(
    (canvasX: number, canvasY: number) => {
      let snapped: { x: number; y: number } | null = null;

      if (hoveredNodeId) {
        const hoveredNode = nodes.find((n) => n.id === hoveredNodeId);
        if (hoveredNode) {
          const result = findNearestHandle(
            { x: canvasX, y: canvasY },
            { x: hoveredNode.x, y: hoveredNode.y, width: hoveredNode.width, height: hoveredNode.height },
          );
          snapped = result.midpoint;
          ropeTargetRef.current = { x: snapped.x, y: snapped.y };
          setRopeTarget({ x: snapped.x, y: snapped.y });
        }
      } else {
        ropeTargetRef.current = { x: canvasX, y: canvasY };
        setRopeTarget({ x: canvasX, y: canvasY });
      }

      setSnappedMidpoint(snapped);
      setDragOverNodeId(hoveredNodeId);
    },
    [hoveredNodeId, nodes],
  );

  const endConnectionDrag = useCallback(
    (_canvasX: number, _canvasY: number) => {
      stopAnimationLoop();

      const sourceNodeId = connectionDrag?.sourceNodeId;
      const targetNodeId = dragOverNodeId;

      const reset = () => {
        setConnectionDrag(null);
        setRopeTarget(null);
        setRopePoints(null);
        setDragOverNodeId(null);
        setSnappedMidpoint(null);
        ropeRef.current = null;
        ropeTargetRef.current = null;
        sourceRef.current = null;
      };

      if (targetNodeId && targetNodeId !== sourceNodeId && selectedCanvasId) {
        safeInvoke<CanvasEdge>("create_canvas_edge", {
          canvasId: selectedCanvasId,
          sourceNodeId,
          targetNodeId,
          label: null,
          metadataJson: null,
        })
          .then((edge) => {
            setEdges((prev) => [...prev, edge]);
            showToast("Edge created");
            reset();
          })
          .catch(() => {
            showToast("Failed to create edge");
            reset();
          });
      } else {
        reset();
      }
    },
    [
      connectionDrag,
      dragOverNodeId,
      selectedCanvasId,
      showToast,
      setEdges,
      stopAnimationLoop,
    ],
  );

  useEffect(() => {
    return () => {
      stopAnimationLoop();
    };
  }, [stopAnimationLoop]);

  return {
    connectionDrag,
    ropeTarget,
    ropePoints,
    dragOverNodeId,
    snappedMidpoint,
    startConnectionDrag,
    updateConnectionDrag,
    endConnectionDrag,
  };
}
