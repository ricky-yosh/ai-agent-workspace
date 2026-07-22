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
  getEdgePoint,
} from "../../canvas/geometry";

export interface RewireState {
  edgeId: string;
  sourceNodeId: string;
  originalTargetNodeId: string;
  sourceX: number;
  sourceY: number;
}

export function useCanvasRewire(params: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedCanvasId: string | null;
  showToast: (msg: string) => void;
  setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>;
  hoveredNodeId: string | null;
}): {
  rewire: RewireState | null;
  rewireRopePoints: RopePoint[] | null;
  rewireDragOverNodeId: string | null;
  rewireSnappedMidpoint: { x: number; y: number } | null;
  rewireSourceDir: { x: number; y: number } | null;
  rewireTargetDir: { x: number; y: number } | null;
  startRewire: (edgeId: string, endX: number, endY: number) => void;
  updateRewire: (canvasX: number, canvasY: number) => void;
  endRewire: (canvasX: number, canvasY: number) => void;
  rewireRef: React.MutableRefObject<RewireState | null>;
  rewireDragOverNodeIdRef: React.MutableRefObject<string | null>;
} {
  const { nodes, edges, selectedCanvasId, showToast, setEdges, hoveredNodeId } = params;

  const [rewire, setRewire] = useState<RewireState | null>(null);
  const [rewireRopePoints, setRewireRopePoints] = useState<RopePoint[] | null>(null);
  const [rewireDragOverNodeId, setRewireDragOverNodeId] = useState<string | null>(null);
  const [rewireSnappedMidpoint, setRewireSnappedMidpoint] = useState<{ x: number; y: number } | null>(null);
  const [rewireSourceDir, setRewireSourceDir] = useState<{ x: number; y: number } | null>(null);
  const [rewireTargetDir, setRewireTargetDir] = useState<{ x: number; y: number } | null>(null);

  const rewireSourceRef = useRef<{ x: number; y: number } | null>(null);
  const rewireSourceDirRef = useRef<{ x: number; y: number } | null>(null);
  const rewireRef = useRef<RewireState | null>(null);
  const rewireDragOverNodeIdRef = useRef<string | null>(null);

  const startRewire = useCallback(
    (edgeId: string, endX: number, endY: number) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const sourceNode = nodes.find((n) => n.id === edge.source_node_id);
      if (!sourceNode) return;

      // Determine source normal from existing metadata or center direction
      const targetNode = nodes.find((n) => n.id === edge.target_node_id);
      let srcSide: Side;
      if (targetNode) {
        srcSide = facingSide(sourceNode, nodeCenter(targetNode));
      } else {
        const dx = endX - nodeCenter(sourceNode).x;
        const dy = endY - nodeCenter(sourceNode).y;
        srcSide = Math.abs(dx) > Math.abs(dy)
          ? dx >= 0 ? "right" : "left"
          : dy >= 0 ? "bottom" : "top";
      }
      const srcNormal = SIDE_NORMAL[srcSide];

      const cpX = targetNode
        ? (sourceNode.x + sourceNode.width / 2 + targetNode.x + targetNode.width / 2) / 2
        : endX;
      const cpY = targetNode
        ? (sourceNode.y + sourceNode.height / 2 + targetNode.y + targetNode.height / 2) / 2
        : endY;
      const sourceEnd = getEdgePoint(sourceNode, cpX, cpY);

      rewireSourceRef.current = sourceEnd;
      rewireSourceDirRef.current = srcNormal;

      setRewire({
        edgeId,
        sourceNodeId: edge.source_node_id,
        originalTargetNodeId: edge.target_node_id,
        sourceX: sourceEnd.x,
        sourceY: sourceEnd.y,
      });
      rewireRef.current = {
        edgeId,
        sourceNodeId: edge.source_node_id,
        originalTargetNodeId: edge.target_node_id,
        sourceX: sourceEnd.x,
        sourceY: sourceEnd.y,
      };
      setRewireSourceDir(srcNormal);
      setRewireTargetDir(null);
      setRewireRopePoints(
        computeDragRope(sourceEnd, { x: endX, y: endY }, { sourceDir: srcNormal, targetDir: null }),
      );
      setRewireDragOverNodeId(null);
      setRewireSnappedMidpoint(null);
    },
    [nodes, edges],
  );

  const updateRewire = useCallback(
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

      setRewireTargetDir(tgtDir);
      setRewireSnappedMidpoint(snapped);
      setRewireDragOverNodeId(hoveredNodeId);
      rewireDragOverNodeIdRef.current = hoveredNodeId;

      if (rewireSourceRef.current) {
        setRewireRopePoints(
          computeDragRope(rewireSourceRef.current, target, {
            sourceDir: rewireSourceDirRef.current,
            targetDir: tgtDir,
          }),
        );
      }
    },
    [hoveredNodeId, nodes],
  );

  const endRewire = useCallback(
    (_canvasX: number, _canvasY: number) => {
      const state = rewireRef.current;
      const targetNodeId = rewireDragOverNodeIdRef.current;

      const reset = () => {
        rewireRef.current = null;
        rewireDragOverNodeIdRef.current = null;
        setRewire(null);
        setRewireRopePoints(null);
        setRewireDragOverNodeId(null);
        setRewireSnappedMidpoint(null);
        setRewireSourceDir(null);
        setRewireTargetDir(null);
        rewireSourceRef.current = null;
        rewireSourceDirRef.current = null;
      };

      if (state && targetNodeId && targetNodeId !== state.sourceNodeId && selectedCanvasId) {
        // Resolve sides
        const sourceNode = nodes.find((n) => n.id === state.sourceNodeId);
        const targetNode = nodes.find((n) => n.id === targetNodeId);
        let sourceSide: Side | null = null;
        let targetSide: Side | null = null;
        if (sourceNode && targetNode) {
          sourceSide = facingSide(sourceNode, nodeCenter(targetNode));
          targetSide = facingSide(targetNode, nodeCenter(sourceNode));
        }

        const metadataJson = targetSide
          ? JSON.stringify({ sourceSide, targetSide })
          : null;

        safeInvoke<CanvasEdge>("update_canvas_edge", {
          id: state.edgeId,
          sourceNodeId: null,
          targetNodeId,
          label: null,
          metadataJson,
        })
          .then((edge) => {
            const patched = metadataJson
              ? { ...edge, metadata_json: metadataJson }
              : edge;
            setEdges((prev) => prev.map((e) => (e.id === state.edgeId ? patched : e)));
            showToast("Edge rewired");
            reset();
          })
          .catch(() => {
            showToast("Failed to rewire edge");
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
    rewire,
    rewireRopePoints,
    rewireDragOverNodeId,
    rewireSnappedMidpoint,
    rewireSourceDir,
    rewireTargetDir,
    startRewire,
    updateRewire,
    endRewire,
    rewireRef,
    rewireDragOverNodeIdRef,
  };
}
