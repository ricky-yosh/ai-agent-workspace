import { useState, useCallback, useRef } from "react";
import type { CanvasNode, CanvasEdge } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";
import { computeDragRope, type RopePoint } from "../../canvas/ropePhysics";
import { findNearestHandle } from "../../canvas/snapping";
import {
  type Side,
  SIDE_NORMAL,
  nodeCenter,
  facingSide,
  sideHandleCenter,
} from "../../canvas/geometry";

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
  sourceDir: { x: number; y: number } | null;
  targetDir: { x: number; y: number } | null;
  startConnectionDrag: (nodeId: string, side: Side) => void;
  updateConnectionDrag: (canvasX: number, canvasY: number) => void;
  endConnectionDrag: (canvasX: number, canvasY: number) => void;
  connectionDragRef: React.MutableRefObject<ConnectionDragState | null>;
  dragOverNodeIdRef: React.MutableRefObject<string | null>;
} {
  const { nodes, selectedCanvasId, showToast, setEdges, hoveredNodeId } = params;

  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(null);
  const [ropeTarget, setRopeTarget] = useState<{ x: number; y: number } | null>(null);
  const [ropePoints, setRopePoints] = useState<RopePoint[] | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [snappedMidpoint, setSnappedMidpoint] = useState<{ x: number; y: number } | null>(null);
  const [sourceDir, setSourceDir] = useState<{ x: number; y: number } | null>(null);
  const [targetDir, setTargetDir] = useState<{ x: number; y: number } | null>(null);

  const sourceRef = useRef<{ x: number; y: number } | null>(null);
  const sourceDirRef = useRef<{ x: number; y: number } | null>(null);
  const connectionDragRef = useRef<ConnectionDragState | null>(null);
  const dragOverNodeIdRef = useRef<string | null>(null);
  const justStartedRef = useRef(false);

  const startConnectionDrag = useCallback(
    (nodeId: string, side: Side) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const hc = sideHandleCenter(node, side);
      const normal = SIDE_NORMAL[side];
      const source = { x: hc.x, y: hc.y };

      sourceRef.current = source;
      sourceDirRef.current = normal;

      setConnectionDrag({
        sourceNodeId: node.id,
        sourceSide: side,
        handleCanvasX: hc.x,
        handleCanvasY: hc.y,
        sourceNode: node,
      });
      connectionDragRef.current = {
        sourceNodeId: node.id,
        sourceSide: side,
        handleCanvasX: hc.x,
        handleCanvasY: hc.y,
        sourceNode: node,
      };
      setSourceDir(normal);
      setTargetDir(null);
      setRopeTarget({ x: hc.x, y: hc.y });
      setRopePoints(computeDragRope(source, source, { sourceDir: normal, targetDir: null }));
      setDragOverNodeId(null);
      setSnappedMidpoint(null);

      dragOverNodeIdRef.current = null;
      justStartedRef.current = true;
    },
    [nodes],
  );

  const updateConnectionDrag = useCallback(
    (canvasX: number, canvasY: number) => {
      let snapped: { x: number; y: number } | null = null;
      let tgtDir: { x: number; y: number } | null = null;
      let target = { x: canvasX, y: canvasY };

      if (hoveredNodeId) {
        const hoveredNode = nodes.find((n) => n.id === hoveredNodeId);
        if (hoveredNode) {
          const result = findNearestHandle(
            { x: canvasX, y: canvasY },
            { x: hoveredNode.x, y: hoveredNode.y, width: hoveredNode.width, height: hoveredNode.height },
          );
          snapped = result.midpoint;
          tgtDir = SIDE_NORMAL[result.side];
          target = snapped;
        }
      }

      setRopeTarget(target);
      setTargetDir(tgtDir);
      setSnappedMidpoint(snapped);
      setDragOverNodeId(hoveredNodeId);
      dragOverNodeIdRef.current = hoveredNodeId;

      if (sourceRef.current) {
        setRopePoints(
          computeDragRope(sourceRef.current, target, {
            sourceDir: sourceDirRef.current,
            targetDir: tgtDir,
          }),
        );
      }
    },
    [hoveredNodeId, nodes],
  );

  const endConnectionDrag = useCallback(
    (_canvasX: number, _canvasY: number) => {
      const drag = connectionDragRef.current;
      const sourceNodeId = drag?.sourceNodeId;
      const targetNodeId = dragOverNodeIdRef.current;

      if (justStartedRef.current) {
        justStartedRef.current = false;
        if (!targetNodeId) {
          return;
        }
      }

      const reset = () => {
        connectionDragRef.current = null;
        dragOverNodeIdRef.current = null;
        justStartedRef.current = false;
        setConnectionDrag(null);
        setRopeTarget(null);
        setRopePoints(null);
        setDragOverNodeId(null);
        setSnappedMidpoint(null);
        setSourceDir(null);
        setTargetDir(null);
        sourceRef.current = null;
        sourceDirRef.current = null;
      };

      if (targetNodeId && targetNodeId !== sourceNodeId && selectedCanvasId) {
        // Resolve both sides facing each other
        const sourceNode = nodes.find((n) => n.id === sourceNodeId);
        const targetNode = nodes.find((n) => n.id === targetNodeId);
        let sourceSide = drag?.sourceSide ?? null;
        let targetSide: Side | null = null;
        if (sourceNode && targetNode) {
          sourceSide = facingSide(sourceNode, nodeCenter(targetNode));
          targetSide = facingSide(targetNode, nodeCenter(sourceNode));
        }

        const metadataJson = targetSide
          ? JSON.stringify({ sourceSide, targetSide })
          : null;

        safeInvoke<CanvasEdge>("create_canvas_edge", {
          canvasId: selectedCanvasId,
          sourceNodeId,
          targetNodeId,
          label: null,
          metadataJson,
        })
          .then((edge) => {
            // Patch the edge with the side metadata we computed client-side
            const patched = metadataJson
              ? { ...edge, metadata_json: metadataJson }
              : edge;
            setEdges((prev) => [...prev, patched]);
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
      nodes,
      selectedCanvasId,
      showToast,
      setEdges,
    ],
  );

  return {
    connectionDrag,
    ropeTarget,
    ropePoints,
    dragOverNodeId,
    snappedMidpoint,
    sourceDir,
    targetDir,
    startConnectionDrag,
    updateConnectionDrag,
    endConnectionDrag,
    connectionDragRef,
    dragOverNodeIdRef,
  };
}