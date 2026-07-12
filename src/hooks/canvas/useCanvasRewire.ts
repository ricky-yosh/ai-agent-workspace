import { useState, useCallback, useRef, useEffect } from "react";
import type { CanvasNode, CanvasEdge } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";
import { createRope, stepRope, DEFAULT_ROPE_CONFIG, type RopePoint } from "../../canvas/ropePhysics";
import { findNearestHandle } from "../../canvas/snapping";
import {
  type Side,
  SIDE_NORMAL,
  nodeCenter,
  facingSide,
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
} {
  const { nodes, edges, selectedCanvasId, showToast, setEdges, hoveredNodeId } = params;

  const [rewire, setRewire] = useState<RewireState | null>(null);
  const [rewireRopePoints, setRewireRopePoints] = useState<RopePoint[] | null>(null);
  const [rewireDragOverNodeId, setRewireDragOverNodeId] = useState<string | null>(null);
  const [rewireSnappedMidpoint, setRewireSnappedMidpoint] = useState<{ x: number; y: number } | null>(null);
  const [rewireSourceDir, setRewireSourceDir] = useState<{ x: number; y: number } | null>(null);
  const [rewireTargetDir, setRewireTargetDir] = useState<{ x: number; y: number } | null>(null);

  const rewireSourceRef = useRef<{ x: number; y: number } | null>(null);
  const rewireRopeRef = useRef<RopePoint[] | null>(null);
  const rewireTargetRef = useRef<{ x: number; y: number } | null>(null);
  const rewireSourceDirRef = useRef<{ x: number; y: number } | null>(null);
  const rewireTargetDirRef = useRef<{ x: number; y: number } | null>(null);
  const rewireRestLengthRef = useRef(0);
  const rewireRafRef = useRef<number | null>(null);
  const rewireLastTimeRef = useRef<number>(0);

  const startAnimationLoop = useCallback(() => {
    const animate = (time: number) => {
      if (!rewireLastTimeRef.current) {
        rewireLastTimeRef.current = time;
      }
      const dt = Math.min((time - rewireLastTimeRef.current) / 1000, 0.033);
      rewireLastTimeRef.current = time;

      const rope = rewireRopeRef.current;
      const source = rewireSourceRef.current;
      const target = rewireTargetRef.current;
      if (rope && source && target) {
        stepRope(rope, source, target, dt, {
          sourceDir: rewireSourceDirRef.current,
          targetDir: rewireTargetDirRef.current,
          sagScale: 1.32,
          restLengthRef: rewireRestLengthRef,
        });
        setRewireRopePoints([...rope]);
      }

      rewireRafRef.current = requestAnimationFrame(animate);
    };

    rewireLastTimeRef.current = 0;
    rewireRafRef.current = requestAnimationFrame(animate);
  }, []);

  const stopAnimationLoop = useCallback(() => {
    if (rewireRafRef.current !== null) {
      cancelAnimationFrame(rewireRafRef.current);
      rewireRafRef.current = null;
    }
    rewireLastTimeRef.current = 0;
  }, []);

  const getEdgePoint = useCallback(
    (node: CanvasNode, tx: number, ty: number) => {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const dxx = tx - cx;
      const dyy = ty - cy;
      const angle = Math.atan2(dyy, dxx);
      const hw = node.width / 2;
      const hh = node.height / 2;
      const tanAngle = Math.abs(Math.tan(angle));
      let ix: number, iy: number;
      if (tanAngle * hw <= hh) {
        ix = dxx > 0 ? hw : -hw;
        iy = ix * Math.tan(angle);
      } else {
        iy = dyy > 0 ? hh : -hh;
        ix = iy / Math.tan(angle);
      }
      return { x: cx + ix, y: cy + iy };
    },
    [],
  );

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

      const rope = createRope(sourceEnd, { x: endX, y: endY });
      const segCount = DEFAULT_ROPE_CONFIG.points - 1;
      rewireRestLengthRef.current = DEFAULT_ROPE_CONFIG.slackOffset / segCount;

      rewireSourceRef.current = sourceEnd;
      rewireSourceDirRef.current = srcNormal;
      rewireTargetDirRef.current = null;
      rewireRopeRef.current = rope;
      rewireTargetRef.current = { x: endX, y: endY };

      setRewire({
        edgeId,
        sourceNodeId: edge.source_node_id,
        originalTargetNodeId: edge.target_node_id,
        sourceX: sourceEnd.x,
        sourceY: sourceEnd.y,
      });
      setRewireSourceDir(srcNormal);
      setRewireTargetDir(null);
      setRewireRopePoints([...rope]);
      setRewireDragOverNodeId(null);
      setRewireSnappedMidpoint(null);

      startAnimationLoop();
    },
    [nodes, edges, getEdgePoint, startAnimationLoop],
  );

  const updateRewire = useCallback(
    (canvasX: number, canvasY: number) => {
      let snapped: { x: number; y: number } | null = null;
      let tgtDir: { x: number; y: number } | null = null;

      if (hoveredNodeId) {
        const hoveredNode = nodes.find((n) => n.id === hoveredNodeId);
        if (hoveredNode) {
          const result = findNearestHandle(
            { x: canvasX, y: canvasY },
            { x: hoveredNode.x, y: hoveredNode.y, width: hoveredNode.width, height: hoveredNode.height },
          );
          snapped = result.midpoint;
          tgtDir = SIDE_NORMAL[result.side];
          rewireTargetRef.current = { x: snapped.x, y: snapped.y };
        }
      } else {
        rewireTargetRef.current = { x: canvasX, y: canvasY };
      }

      rewireTargetDirRef.current = tgtDir;
      setRewireTargetDir(tgtDir);
      setRewireSnappedMidpoint(snapped);
      setRewireDragOverNodeId(hoveredNodeId);
    },
    [hoveredNodeId, nodes],
  );

  const endRewire = useCallback(
    (_canvasX: number, _canvasY: number) => {
      stopAnimationLoop();

      const state = rewire;
      const targetNodeId = rewireDragOverNodeId;

      const reset = () => {
        setRewire(null);
        setRewireRopePoints(null);
        setRewireDragOverNodeId(null);
        setRewireSnappedMidpoint(null);
        setRewireSourceDir(null);
        setRewireTargetDir(null);
        rewireRopeRef.current = null;
        rewireTargetRef.current = null;
        rewireSourceRef.current = null;
        rewireSourceDirRef.current = null;
        rewireTargetDirRef.current = null;
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
      rewire,
      rewireDragOverNodeId,
      nodes,
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
    rewire,
    rewireRopePoints,
    rewireDragOverNodeId,
    rewireSnappedMidpoint,
    rewireSourceDir,
    rewireTargetDir,
    startRewire,
    updateRewire,
    endRewire,
  };
}