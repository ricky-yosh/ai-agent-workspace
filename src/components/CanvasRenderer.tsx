import { useState, useCallback, useRef, type ReactNode, type RefObject } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "./ui";
import { CursorFollower } from "./CursorFollower";
import {
  type Side,
  SIDE_NORMAL,
  nodeCenter as geometryNodeCenter,
  sideHandleCenter as geometrySideHandleCenter,
  facingSide,
  parseSides,
  HANDLE_LONG,
  HANDLE_SHORT,
  halfPillPath,
  findNearestEdge as geometryFindNearestEdge,
} from "../canvas/geometry";
import { DragRope } from "../canvas/DragRope";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CanvasNode {
  id: string;
  canvas_id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasEdge {
  id: string;
  canvas_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanvasGroup {
  id: string;
  canvas_id: string;
  label: string;
  node_ids_json: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

// Zoom limits
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5.0;



// Handle hit-test constants
const HIT_OUTWARD = 10;
const HIT_INWARD = 2;

function getConnectedNodeSides(node: CanvasNode, edges: CanvasEdge[]): Set<Side> {
  const allConnected = edges.some(
    e => e.source_node_id === node.id || e.target_node_id === node.id
  );
  if (allConnected) {
    return new Set<Side>(['top', 'right', 'bottom', 'left']);
  }
  return new Set<Side>();
}

function handleCenter(side: Side, node: CanvasNode): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: node.x + node.width / 2, y: node.y };
    case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left': return { x: node.x, y: node.y + node.height / 2 };
    case 'right': return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}

interface CanvasRendererProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
  mode: "editable" | "read-only";
  // View state
  offsetX: number;
  offsetY: number;
  zoom: number;
  onOffsetChange: (x: number, y: number) => void;
  onZoomChange: (zoom: number) => void;
  // Node events
  onNodeClick?: (nodeId: string, e: React.MouseEvent) => void;
  onNodeMouseDown?: (nodeId: string, e: React.MouseEvent) => void;
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  onNodeDoubleClick?: (nodeId: string, e: React.MouseEvent) => void;
  onNodeHover?: (nodeId: string | null) => void;
  // Edge events
  onEdgeClick?: (edgeId: string) => void;
  onEdgeContextMenu?: (edgeId: string, x: number, y: number) => void;
  // Group events
  onGroupContextMenu?: (groupId: string, x: number, y: number) => void;
  // Canvas events
  onCanvasClick?: (
    canvasX: number,
    canvasY: number,
    e: React.MouseEvent,
  ) => void;
  onCanvasMouseDown?: (
    canvasX: number,
    canvasY: number,
    e: React.MouseEvent,
  ) => void;
  onCanvasContextMenu?: (
    canvasX: number,
    canvasY: number,
    screenX: number,
    screenY: number,
  ) => void;
  onCanvasMouseMove?: (
    canvasX: number,
    canvasY: number,
    viewportX: number,
    viewportY: number,
    e: React.MouseEvent,
  ) => void;
  onCanvasMouseUp?: (
    canvasX: number,
    canvasY: number,
    e: React.MouseEvent,
  ) => void;
  // Selection
  selectedNodeIds?: Set<string>;
  // Animation
  deletingNodeIds?: Set<string>;
  // Rendering overrides
  renderNodeContent?: (node: CanvasNode) => ReactNode;
  // Tags (optional)
  tags?: Array<{ id: string; node_id: string; tag: string }>;
  renderTags?: (nodeId: string) => ReactNode;
  // Box-select (rubber band)
  boxSelect?: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;
  // Hover state (for side handles)
  hoveredNodeId?: string | null;
  // Drag state (for cursor style)
  draggedNodeId?: string | null;
  // Inline editing state (for rendering the input inside foreignObject)
  editingNodeId?: string | null;
  editingValue?: string;
  onEditingValueChange?: (value: string) => void;
  onEditKeyDown?: (e: React.KeyboardEvent) => void;
  onEditBlur?: () => void;
  editInputRef?: RefObject<HTMLInputElement | null>;
  // Children rendered inside the transform group (e.g. placement ghosts)
  children?: ReactNode;
  onHandleMouseDown?: (nodeId: string, side: Side) => void;
  connectionDragActive?: boolean;
  ropePoints?: Array<{ x: number; y: number }> | null;
  dragOverNodeId?: string | null;
  onArrowheadGrab?: (edgeId: string, endX: number, endY: number) => void;
  rewireRopePoints?: Array<{ x: number; y: number }> | null;
  rewireDragOverNodeId?: string | null;
  rewireActive?: boolean;
  snappedMidpoint?: { x: number; y: number } | null;
  rewireSnappedMidpoint?: { x: number; y: number } | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CanvasRenderer({
  nodes,
  edges,
  groups,
  mode,
  offsetX,
  offsetY,
  zoom,
  onOffsetChange,
  onZoomChange,
  onNodeClick,
  onNodeMouseDown,
  onNodeContextMenu,
  onNodeDoubleClick,
  onNodeHover,
  onEdgeClick,
  onEdgeContextMenu,
  onGroupContextMenu,
  onCanvasClick,
  onCanvasMouseDown,
  onCanvasContextMenu,
  onCanvasMouseMove,
  onCanvasMouseUp,
  selectedNodeIds = new Set(),
  deletingNodeIds = new Set(),
  renderNodeContent,
  tags = [],
  renderTags,
  boxSelect = null,
  hoveredNodeId = null,
  draggedNodeId = null,
  editingNodeId = null,
  editingValue = "",
  onEditingValueChange,
  onEditKeyDown,
  onEditBlur,
  editInputRef,
  children,
  onHandleMouseDown,
  connectionDragActive = false,
  ropePoints: ropePointsProp = null,
  dragOverNodeId = null,
  onArrowheadGrab,
  rewireRopePoints: rewireRopePointsProp = null,
  rewireDragOverNodeId: rewireDragOverNodeIdProp = null,
  rewireActive = false,
  snappedMidpoint = null,
  rewireSnappedMidpoint: rewireSnappedMidpointProp = null,
}: CanvasRendererProps) {
  const activeSnappedMidpoint = snappedMidpoint ?? rewireSnappedMidpointProp;
  const viewportRef = useRef<HTMLDivElement>(null);

  // ── Internal pan state ────────────────────────────────────────────────

  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const isSpacePressedRef = useRef(false);

  // ── Pan handling ──────────────────────────────────────────────────────

  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-node]")) return;

      e.preventDefault();

      if (mode === "read-only" || isSpacePressedRef.current) {
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          offsetX,
          offsetY,
        };
      }
    },
    [offsetX, offsetY, mode],
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      onOffsetChange(
        panStartRef.current.offsetX + dx,
        panStartRef.current.offsetY + dy,
      );
    },
    [isPanning, onOffsetChange],
  );

  const handlePanEnd = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, [isPanning]);

  // ── Zoom handling ─────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * delta));

      const scale = newZoom / zoom;
      const newOffsetX = mouseX - (mouseX - offsetX) * scale;
      const newOffsetY = mouseY - (mouseY - offsetY) * scale;

      onOffsetChange(newOffsetX, newOffsetY);
      onZoomChange(newZoom);
    },
    [zoom, offsetX, offsetY, onOffsetChange, onZoomChange],
  );

  // ── Mouse move dispatch ───────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      handlePanMove(e);

      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) {
        const canvasX = (e.clientX - rect.left - offsetX) / zoom;
        const canvasY = (e.clientY - rect.top - offsetY) / zoom;
        const viewportX = e.clientX - rect.left;
        const viewportY = e.clientY - rect.top;
        onCanvasMouseMove?.(canvasX, canvasY, viewportX, viewportY, e);
      }
    },
    [handlePanMove, offsetX, zoom, onCanvasMouseMove],
  );

  // ── Mouse up dispatch ─────────────────────────────────────────────────

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      handlePanEnd();

      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) {
        const canvasX = (e.clientX - rect.left - offsetX) / zoom;
        const canvasY = (e.clientY - rect.top - offsetY) / zoom;
        onCanvasMouseUp?.(canvasX, canvasY, e);
      }
    },
    [handlePanEnd, offsetX, zoom, onCanvasMouseUp],
  );

  // ── Canvas click dispatch ─────────────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const canvasX = (e.clientX - rect.left - offsetX) / zoom;
      const canvasY = (e.clientY - rect.top - offsetY) / zoom;
      onCanvasClick?.(canvasX, canvasY, e);
    },
    [offsetX, zoom, onCanvasClick],
  );

  // ── Canvas mouse down dispatch ────────────────────────────────────────

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const canvasX = (e.clientX - rect.left - offsetX) / zoom;
      const canvasY = (e.clientY - rect.top - offsetY) / zoom;
      onCanvasMouseDown?.(canvasX, canvasY, e);
    },
    [offsetX, zoom, onCanvasMouseDown],
  );

  // ── Context menu dispatch ─────────────────────────────────────────────

  const findNearestEdge = useCallback(
    (cx: number, cy: number, threshold: number = 10): string | null =>
      geometryFindNearestEdge(cx, cy, nodes, edges, threshold),
    [nodes, edges],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const canvasX = (screenX - offsetX) / zoom;
      const canvasY = (screenY - offsetY) / zoom;

      // Check node hit
      for (const node of nodes) {
        if (
          canvasX >= node.x &&
          canvasX <= node.x + node.width &&
          canvasY >= node.y &&
          canvasY <= node.y + node.height
        ) {
          onNodeContextMenu?.(node.id, e.clientX, e.clientY);
          return;
        }
      }

      // Check group hit
      for (const group of groups) {
        const nodeIds: string[] = JSON.parse(group.node_ids_json || "[]");
        const memberNodes = nodes.filter((n) => nodeIds.includes(n.id));
        if (memberNodes.length === 0) continue;

        const padding = 20;
        const minX = Math.min(...memberNodes.map((n) => n.x)) - padding;
        const minY = Math.min(...memberNodes.map((n) => n.y)) - padding;
        const maxX =
          Math.max(...memberNodes.map((n) => n.x + n.width)) + padding;
        const maxY =
          Math.max(...memberNodes.map((n) => n.y + n.height)) + padding;

        if (
          canvasX >= minX &&
          canvasX <= maxX &&
          canvasY >= minY &&
          canvasY <= maxY
        ) {
          onGroupContextMenu?.(group.id, e.clientX, e.clientY);
          return;
        }
      }

      // Check edge hit
      const edgeId = findNearestEdge(canvasX, canvasY, 10);
      if (edgeId) {
        onEdgeContextMenu?.(edgeId, e.clientX, e.clientY);
        return;
      }

      // Empty canvas
      onCanvasContextMenu?.(canvasX, canvasY, e.clientX, e.clientY);
    },
    [
      offsetX,
      offsetY,
      zoom,
      nodes,
      groups,
      findNearestEdge,
      onNodeContextMenu,
      onGroupContextMenu,
      onEdgeContextMenu,
      onCanvasContextMenu,
    ],
  );

  // ── Keyboard listeners (Space for pan cursor) ─────────────────────────

  const setupKeyListeners = useCallback(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === " " &&
        !e.repeat &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        isSpacePressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        isSpacePressedRef.current = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const keyCleanupRef = useRef<(() => void) | null>(null);
  if (!keyCleanupRef.current) {
    keyCleanupRef.current = setupKeyListeners();
  }

  // ── Cursor style ──────────────────────────────────────────────────────

  let cursor = "default";
  if (isPanning) {
    cursor = "grabbing";
  } else if (mode === "read-only" || isSpacePressedRef.current) {
    cursor = "grab";
  } else if (draggedNodeId) {
    cursor = "grabbing";
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  const LAUNCH = 30;

  function sideLaunch(n: CanvasNode, side: Side): { x: number; y: number } {
    const hc = geometrySideHandleCenter(n, side);
    const norm = SIDE_NORMAL[side];
    return { x: hc.x + norm.x * LAUNCH, y: hc.y + norm.y * LAUNCH };
  }

  // ── Edge path renderer ────────────────────────────────────────────────

  const renderEdgePath = (edge: CanvasEdge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source_node_id);
    const targetNode = nodes.find((n) => n.id === edge.target_node_id);
    if (!sourceNode || !targetNode) return null;

    // Resolve source/target sides
    const { sourceSide: metaSrcSide, targetSide: metaTgtSide } = parseSides(edge.metadata_json);
    const srcSide: Side = metaSrcSide ?? facingSide(sourceNode, geometryNodeCenter(targetNode));
    const tgtSide: Side = metaTgtSide ?? facingSide(targetNode, geometryNodeCenter(sourceNode));

    const start = geometrySideHandleCenter(sourceNode, srcSide);
    const end = geometrySideHandleCenter(targetNode, tgtSide);
    const srcL = sideLaunch(sourceNode, srcSide);
    const tgtL = sideLaunch(targetNode, tgtSide);

    // Compute control point for the quadratic bezier: midpoint of the two launch anchors
    const cpX = (srcL.x + tgtL.x) / 2;
    const cpY = (srcL.y + tgtL.y) / 2;

    // Launch tangents: short segments from endpoint to launch point
    const path = `M ${start.x} ${start.y} L ${srcL.x} ${srcL.y} Q ${cpX} ${cpY} ${tgtL.x} ${tgtL.y} L ${end.x} ${end.y}`;

    const arrowSize = 10;
    // Arrow angle derived from launch anchor direction
    const arrowAngle = Math.atan2(end.y - tgtL.y, end.x - tgtL.x);

    return (
      <motion.g
        key={edge.id}
        initial={false}
        animate={{ pathLength: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.26, ease: "linear" }}
        onClick={() => onEdgeClick?.(edge.id)}
        style={{ cursor: "pointer" }}
      >
        {/* Base path (solid resting stroke) */}
        <motion.path
          d={path}
          fill="none"
          stroke="var(--canvas-edge)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        />
        {/* Flow path (dashed, marching ants) — revealed via data attribute */}
        <path
          d={path}
          fill="none"
          stroke="var(--canvas-amber, #EC9F05)"
          strokeWidth={4.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="12 10"
          className="ef-flow"
          data-diagram-edge-dragging={connectionDragActive || rewireActive ? "true" : undefined}
          pointerEvents="none"
        />
        {/* Source dot */}
        <circle
          cx={start.x}
          cy={start.y}
          r={4}
          fill="var(--canvas-edge)"
          className="edge-handle"
        />
        {/* Arrowhead + rewire grab target */}
        <g style={{ cursor: "grab" }}>
          <circle
            cx={end.x}
            cy={end.y}
            r={12}
            fill="none"
            style={{ pointerEvents: "all" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onArrowheadGrab?.(edge.id, end.x, end.y);
            }}
          />
          <motion.polygon
            points={`
              ${end.x},${end.y}
              ${end.x - arrowSize * Math.cos(arrowAngle - Math.PI / 6)},${end.y - arrowSize * Math.sin(arrowAngle - Math.PI / 6)}
              ${end.x - arrowSize * Math.cos(arrowAngle + Math.PI / 6)},${end.y - arrowSize * Math.sin(arrowAngle + Math.PI / 6)}
            `}
            fill="var(--canvas-edge)"
            initial={false}
            animate={{ scale: 1 }}
            transition={{ duration: 0.52, delay: 0.42, ease: "easeOut" }}
            style={{ pointerEvents: "none" }}
          />
        </g>
        {edge.label && (
          <text
            x={cpX}
            y={cpY - 8}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize={12}
            fontFamily="var(--font-family-sans)"
          >
            {edge.label}
          </text>
        )}
      </motion.g>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={viewportRef}
      style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
        cursor,
      }}
      onMouseDown={(e) => { handlePanStart(e); handleCanvasMouseDown(e); }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <svg
        width="100%"
        height="100%"
        style={{
          minWidth: 800,
          minHeight: 600,
          background: "var(--canvas-bg)",
          overflow: "visible",
        }}
        onClick={handleCanvasClick}
      >
        {/* Transformed content group */}
        <g transform={`translate(${offsetX}, ${offsetY}) scale(${zoom})`}>
          {/* Grid pattern */}
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="var(--border)"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
            <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--canvas-node-selected)" floodOpacity="0.4" />
            </filter>
          </defs>
          <rect x={-10000} y={-10000} width={20000} height={20000} fill="url(#grid)" />

          {/* Edges */}
          <AnimatePresence>
            {edges.map((edge) => renderEdgePath(edge))}
          </AnimatePresence>

          <DragRope
            points={ropePointsProp}
            isValid={dragOverNodeId !== null}
          />
          <DragRope
            points={rewireRopePointsProp}
            isValid={rewireDragOverNodeIdProp !== null}
          />

          {/* Custom children (e.g. placement ghosts) */}
          {children}

          {/* Groups - render behind nodes */}
          <AnimatePresence>
            {groups.map((group) => {
              const nodeIds: string[] = JSON.parse(group.node_ids_json || "[]");
              const memberNodes = nodes.filter((n) => nodeIds.includes(n.id));
              if (memberNodes.length === 0) return null;

              const padding = 20;
              const minX =
                Math.min(...memberNodes.map((n) => n.x)) - padding;
              const minY =
                Math.min(...memberNodes.map((n) => n.y)) - padding;
              const maxX =
                Math.max(...memberNodes.map((n) => n.x + n.width)) + padding;
              const maxY =
                Math.max(...memberNodes.map((n) => n.y + n.height)) + padding;
              const groupWidth = maxX - minX;
              const groupHeight = maxY - minY;

              return (
                <motion.g
                  key={group.id}
                  initial={false}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.26, ease: "linear" }}
                >
                  <rect
                    x={minX}
                    y={minY}
                    width={groupWidth}
                    height={groupHeight}
                    rx={12}
                    ry={12}
                    fill="var(--canvas-accent)"
                    fillOpacity={0.06}
                    stroke="var(--canvas-accent)"
                    strokeWidth={1.5}
                    strokeOpacity={0.3}
                    strokeDasharray="6 3"
                  />
                  <text
                    x={minX + 10}
                    y={minY - 8}
                    fill="var(--canvas-accent)"
                    fontSize={12}
                    fontFamily="var(--font-family-sans)"
                    fontWeight={500}
                    opacity={0.8}
                  >
                    {group.label}
                  </text>
                </motion.g>
              );
            })}
          </AnimatePresence>

          {/* Nodes */}
          <AnimatePresence>
            {nodes.map((node) => {
              const isSelected = selectedNodeIds.has(node.id);
              const isDeleting = deletingNodeIds.has(node.id);
              const isEditing = editingNodeId === node.id;
              const isDragging = draggedNodeId === node.id;
              const nodeTags = tags.filter((t) => t.node_id === node.id);

              return (
                <motion.g
                  key={node.id}
                  data-node="true"
                  initial={false}
                  animate={{
                    scale: isDragging ? 1.05 : 1,
                    opacity: isDeleting ? 0 : 1,
                    zIndex: isDragging ? 1000 : 1,
                  }}
                  exit={{ opacity: 0 }}
                  transition={
                    isDeleting
                      ? { duration: 0.26, ease: "linear" }
                      : {
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                          duration: 0.62,
                        }
                  }
                  style={{
                    cursor: isEditing
                      ? "text"
                      : isDragging
                        ? "grabbing"
                        : "grab",
                    pointerEvents: isDragging || isDeleting ? "none" : "auto",
                    '--handle-opacity': hoveredNodeId === node.id ? 1 : 0,
                  } as React.CSSProperties}
                  onMouseDown={(e) => {
                    if (!isEditing) onNodeMouseDown?.(node.id, e);
                  }}
                  onClick={(e) => {
                    if (!isEditing) {
                      e.stopPropagation();
                      onNodeClick?.(node.id, e);
                    }
                  }}
                  onDoubleClick={(e) => onNodeDoubleClick?.(node.id, e)}
                  onMouseEnter={() => onNodeHover?.(node.id)}
                  onMouseLeave={() => onNodeHover?.(null)}
                >
                  {/* Node background */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={8}
                    ry={8}
                    fill="var(--canvas-node-bg)"
                    stroke={
                      isDragging
                        ? "var(--canvas-node-selected)"
                        : isSelected
                          ? "var(--canvas-node-selected)"
                          : isEditing
                            ? "var(--canvas-node-selected)"
                            : "var(--canvas-node-border)"
                    }
                    strokeWidth={isDragging || isSelected || isEditing ? 2 : 1}
                    filter={isDragging ? "url(#drop-shadow)" : undefined}
                  />

                  {/* Drop ring during connection drag or rewire */}
                  {(connectionDragActive || rewireActive) && (dragOverNodeId === node.id || rewireDragOverNodeIdProp === node.id) && (
                    <rect
                      x={node.x + 1}
                      y={node.y + 1}
                      width={node.width - 2}
                      height={node.height - 2}
                      rx={7}
                      ry={7}
                      fill="none"
                      stroke="var(--canvas-success, #22c55e)"
                      strokeWidth={2}
                      strokeOpacity={0.8}
                      className="drop-ring"
                      pointerEvents="none"
                    />
                  )}

                  {/* Side handles */}
                  {(['top', 'right', 'bottom', 'left'] as Side[]).map((side) => {
                    const { x: cx, y: cy } = handleCenter(side, node);
                    const isConnected = getConnectedNodeSides(node, edges).has(side);
                    const isSnapped = activeSnappedMidpoint !== null &&
                      Math.abs(activeSnappedMidpoint.x - cx) < 5 &&
                      Math.abs(activeSnappedMidpoint.y - cy) < 5;
                    const bobKeyframe = `handle-bob-${side}`;
                    const hitWidth = HANDLE_LONG + HIT_INWARD + HIT_OUTWARD;
                    const hitHeight = HANDLE_SHORT + HIT_INWARD + HIT_OUTWARD;
                    return (
                      <g
                        key={side}
                        transform={`translate(${cx}, ${cy}) scale(${1 / zoom})`}
                        style={{
                          opacity: isConnected || hoveredNodeId === node.id ? 1 : 0,
                          transition: 'opacity var(--canvas-duration-fast, .15s) var(--canvas-ease-state, cubic-bezier(.2,.8,.2,1))',
                        }}
                      >
                        <rect
                          x={-hitWidth / 2}
                          y={-hitHeight / 2}
                          width={hitWidth}
                          height={hitHeight}
                          fill="none"
                          style={{ pointerEvents: 'all', cursor: 'grab' }}
                          onPointerDown={(e: React.PointerEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onHandleMouseDown?.(node.id, side);
                          }}
                        />
                        <path
                          d={halfPillPath(side)}
                          className={`side-handle${isConnected ? ' connected' : ''}${isSnapped ? ' snapped' : ''}`}
                          fill="#888"
                          stroke="#888"
                          strokeWidth={1}
                          style={{
                            pointerEvents: 'none',
                            animationName: (isConnected || connectionDragActive || rewireActive) ? undefined : bobKeyframe,
                          }}
                        />
                      </g>
                    );
                  })}

                  {/* Node content */}
                  <foreignObject
                    x={node.x + 12}
                    y={node.y + 12}
                    width={node.width - 24}
                    height={
                      node.height - 24 - (nodeTags.length > 0 ? 20 : 0)
                    }
                  >
                    {/* NOTE: inline edit input not migrated to <Input> — renders inside SVG <foreignObject>; Input's wrapper <div> would break sizing */}
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingValue}
                        onChange={(e) => onEditingValueChange?.(e.target.value)}
                        onKeyDown={onEditKeyDown}
                        onBlur={onEditBlur}
                        autoFocus
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          color: "var(--text-primary)",
                          fontSize: 13,
                          lineHeight: 1.4,
                          fontFamily: "var(--font-family-sans)",
                          padding: 0,
                          margin: 0,
                          boxSizing: "border-box",
                        }}
                      />
                    ) : renderNodeContent ? (
                      renderNodeContent(node)
                    ) : (
                      <div
                        style={{
                          color: "var(--text-primary)",
                          fontSize: 13,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          wordBreak: "break-word",
                          userSelect: "none",
                        }}
                      >
                        {node.content}
                      </div>
                    )}
                  </foreignObject>

                  {/* Tags */}
                  {renderTags
                    ? renderTags(node.id)
                    : nodeTags.length > 0 && (
                        <foreignObject
                          x={node.x + 8}
                          y={node.y + node.height - 22}
                          width={node.width - 16}
                          height={18}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 4,
                              flexWrap: "nowrap",
                              overflow: "hidden",
                            }}
                          >
                            {nodeTags.slice(0, 3).map((t) => (
                              <Badge key={t.id} size="sm" variant="info">{t.tag}</Badge>
                            ))}
                            {nodeTags.length > 3 && (
                              <span
                                style={{
                                  fontSize: 9,
                                  color: "var(--text-muted)",
                                  alignSelf: "center",
                                }}
                              >
                                +{nodeTags.length - 3}
                              </span>
                            )}
                          </div>
                        </foreignObject>
                      )}

                </motion.g>
              );
            })}
          </AnimatePresence>

          {/* Empty state */}
          {nodes.length === 0 && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text-muted)"
              fontSize={14}
            >
              No nodes yet. Ask the AI to create some.
            </text>
          )}
        </g>

        {/* Box-select rubber band rectangle (rendered in screen coordinates) */}
        {boxSelect && (
          <rect
            x={Math.min(boxSelect.startX, boxSelect.endX)}
            y={Math.min(boxSelect.startY, boxSelect.endY)}
            width={Math.abs(boxSelect.endX - boxSelect.startX)}
            height={Math.abs(boxSelect.endY - boxSelect.startY)}
            fill="var(--canvas-edge)"
            fillOpacity={0.08}
            stroke="var(--canvas-edge)"
            strokeWidth={1}
            strokeOpacity={0.5}
            strokeDasharray="4 2"
            rx={2}
            ry={2}
            pointerEvents="none"
          />
        )}
      </svg>

      {/* Cursor follower HUD */}
      <CursorFollower
        containerRef={viewportRef}
        connectionDragActive={connectionDragActive}
        rewireActive={rewireActive}
        placementActive={false}
        offsetX={offsetX}
        offsetY={offsetY}
        zoom={zoom}
      />
    </div>
  );
}
