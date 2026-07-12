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
  sideHandleCenter,
} from "../../canvas/geometry";

export interface ConnectionDragState {
  sourceNodeId: string;
  sourceSide: Side;
  handleCanvasX: number;
  handleCanvasY: number;
  sourceNode: CanvasNode;
}

export interface SideInfo {
  side: Side;
  normal: { x: number; y: number };
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
} {
  const { nodes, selectedCanvasId, showToast, setEdges, hoveredNodeId } = params;

  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(null);
  const [ropeTarget, setRopeTarget] = useState<{ x: number; y: number } | null>(null);
  const [ropePoints, setRopePoints] = useState<RopePoint[] | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [snappedMidpoint, setSnappedMidpoint] = useState<{ x: number; y: number } | null>(null);
  const [sourceDir, setSourceDir] = useState<{ x: number; y: number } | null>(null);
  const [targetDir, setTargetDir] = useState<{ x: number; y: number } | null>(null);

  const ropeRef = useRef<RopePoint[] | null>(null);
  const ropeTargetRef = useRef<{ x: number; y: number } | null>(null);
  const sourceRef = useRef<{ x: number; y: number } | null>(null);
  const sourceDirRef = useRef<{ x: number; y: number } | null>(null);
  const targetDirRef = useRef<{ x: number; y: number } | null>(null);
  const restLengthRef = useRef(0);
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
        stepRope(rope, source, target, dt, {
          sourceDir: sourceDirRef.current,
          targetDir: targetDirRef.current,
          sagScale: 1.32,
          restLengthRef,
        });
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

      const hc = sideHandleCenter(node, side);
      const normal = SIDE_NORMAL[side];
      const source = { x: hc.x, y: hc.y };
      const rope = createRope(source, source);
      const segCount = DEFAULT_ROPE_CONFIG.points - 1;
      restLengthRef.current = DEFAULT_ROPE_CONFIG.slackOffset / segCount;

      sourceRef.current = source;
      sourceDirRef.current = normal;
      targetDirRef.current = null;
      ropeRef.current = rope;
      ropeTargetRef.current = { x: hc.x, y: hc.y };

      setConnectionDrag({
        sourceNodeId: node.id,
        sourceSide: side,
        handleCanvasX: hc.x,
        handleCanvasY: hc.y,
        sourceNode: node,
      });
      setSourceDir(normal);
      setTargetDir(null);
      setRopeTarget({ x: hc.x, y: hc.y });
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
          ropeTargetRef.current = { x: snapped.x, y: snapped.y };
          setRopeTarget({ x: snapped.x, y: snapped.y });
        }
      } else {
        ropeTargetRef.current = { x: canvasX, y: canvasY };
        setRopeTarget({ x: canvasX, y: canvasY });
      }

      targetDirRef.current = tgtDir;
      setTargetDir(tgtDir);
      setSnappedMidpoint(snapped);
      setDragOverNodeId(hoveredNodeId);
    },
    [hoveredNodeId, nodes],
  );

  const endConnectionDrag = useCallback(
    (_canvasX: number, _canvasY: number) => {
      stopAnimationLoop();

      const drag = connectionDrag;
      const sourceNodeId = drag?.sourceNodeId;
      const targetNodeId = dragOverNodeId;

      const reset = () => {
        setConnectionDrag(null);
        setRopeTarget(null);
        setRopePoints(null);
        setDragOverNodeId(null);
        setSnappedMidpoint(null);
        setSourceDir(null);
        setTargetDir(null);
        ropeRef.current = null;
        ropeTargetRef.current = null;
        sourceRef.current = null;
        sourceDirRef.current = null;
        targetDirRef.current = null;
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
      connectionDrag,
      dragOverNodeId,
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
  };
}