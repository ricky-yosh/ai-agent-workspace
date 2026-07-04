import { useState, useCallback, useRef, type ReactNode, type RefObject } from "react";
import { motion, AnimatePresence } from "motion/react";

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

export interface CanvasRendererProps {
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
  // Edge drag state
  edgeDragSource?: { nodeId: string; x: number; y: number } | null;
  edgeDragTarget?: { x: number; y: number } | null;
  // Animation
  newNodeIds?: Set<string>;
  deletingNodeIds?: Set<string>;
  // Rendering overrides
  renderNodeContent?: (node: CanvasNode) => ReactNode;
  renderNodeOverlay?: (node: CanvasNode) => ReactNode;
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
  // Hover / Alt state (for connection-source breathe effect)
  hoveredNodeId?: string | null;
  isAltPressed?: boolean;
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
  edgeDragSource = null,
  edgeDragTarget = null,
  newNodeIds: _newNodeIds = new Set(),
  deletingNodeIds = new Set(),
  renderNodeContent,
  renderNodeOverlay,
  tags = [],
  renderTags,
  boxSelect = null,
  hoveredNodeId = null,
  isAltPressed = false,
  draggedNodeId = null,
  editingNodeId = null,
  editingValue = "",
  onEditingValueChange,
  onEditKeyDown,
  onEditBlur,
  editInputRef,
  children,
}: CanvasRendererProps) {
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
    (cx: number, cy: number, threshold: number = 10): string | null => {
      let nearestId: string | null = null;
      let nearestDist = Infinity;

      for (const edge of edges) {
        const sourceNode = nodes.find((n) => n.id === edge.source_node_id);
        const targetNode = nodes.find((n) => n.id === edge.target_node_id);
        if (!sourceNode || !targetNode) continue;

        const srcCx = sourceNode.x + sourceNode.width / 2;
        const srcCy = sourceNode.y + sourceNode.height / 2;
        const tgtCx = targetNode.x + targetNode.width / 2;
        const tgtCy = targetNode.y + targetNode.height / 2;

        const ddx = tgtCx - srcCx;
        const ddy = tgtCy - srcCy;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist === 0) continue;
        const curvature = Math.min(dist * 0.2, 50);
        const nx = -ddy / dist;
        const ny = ddx / dist;
        const cpX = (srcCx + tgtCx) / 2 + nx * curvature;
        const cpY = (srcCy + tgtCy) / 2 + ny * curvature;

        const getEdgePoint = (node: CanvasNode, tx: number, ty: number) => {
          const ccx = node.x + node.width / 2;
          const ccy = node.y + node.height / 2;
          const edx = tx - ccx;
          const edy = ty - ccy;
          const angle = Math.atan2(edy, edx);
          const hw = node.width / 2;
          const hh = node.height / 2;
          const tanAngle = Math.abs(Math.tan(angle));
          let ix: number, iy: number;
          if (tanAngle * hw <= hh) {
            ix = edx > 0 ? hw : -hw;
            iy = ix * Math.tan(angle);
          } else {
            iy = edy > 0 ? hh : -hh;
            ix = iy / Math.tan(angle);
          }
          return { x: ccx + ix, y: ccy + iy };
        };

        const p0 = getEdgePoint(sourceNode, cpX, cpY);
        const p2 = getEdgePoint(targetNode, cpX, cpY);
        const p1 = { x: cpX, y: cpY };

        const SAMPLES = 40;
        for (let i = 0; i <= SAMPLES; i++) {
          const t = i / SAMPLES;
          const mt = 1 - t;
          const bx = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
          const by = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
          const d = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
          if (d < nearestDist) {
            nearestDist = d;
            nearestId = edge.id;
          }
        }
      }

      return nearestDist <= threshold ? nearestId : null;
    },
    [edges, nodes],
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

  // ── Edge path renderer ────────────────────────────────────────────────

  const renderEdgePath = (edge: CanvasEdge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source_node_id);
    const targetNode = nodes.find((n) => n.id === edge.target_node_id);
    if (!sourceNode || !targetNode) return null;

    const sourceX = sourceNode.x + sourceNode.width / 2;
    const sourceY = sourceNode.y + sourceNode.height / 2;
    const targetX = targetNode.x + targetNode.width / 2;
    const targetY = targetNode.y + targetNode.height / 2;

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curvature = Math.min(dist * 0.2, 50);

    const nx = -dy / dist;
    const ny = dx / dist;
    const cpX = (sourceX + targetX) / 2 + nx * curvature;
    const cpY = (sourceY + targetY) / 2 + ny * curvature;

    const getEdgePoint = (
      node: CanvasNode,
      tx: number,
      ty: number,
    ) => {
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
    };

    const start = getEdgePoint(sourceNode, cpX, cpY);
    const end = getEdgePoint(targetNode, cpX, cpY);

    const path = `M ${start.x} ${start.y} Q ${cpX} ${cpY} ${end.x} ${end.y}`;

    const arrowSize = 10;
    const t = 0.98;
    const arrowX =
      (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cpX + t * t * end.x;
    const arrowY =
      (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cpY + t * t * end.y;
    const arrowAngle = Math.atan2(end.y - arrowY, end.x - arrowX);

    return (
      <motion.g
        key={edge.id}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.26, ease: "linear" }}
        onClick={() => onEdgeClick?.(edge.id)}
        style={{ cursor: "pointer" }}
      >
        <motion.path
          d={path}
          fill="none"
          stroke="var(--canvas-edge)"
          strokeWidth={2}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        />
        <motion.polygon
          points={`
            ${end.x},${end.y}
            ${end.x - arrowSize * Math.cos(arrowAngle - Math.PI / 6)},${end.y - arrowSize * Math.sin(arrowAngle - Math.PI / 6)}
            ${end.x - arrowSize * Math.cos(arrowAngle + Math.PI / 6)},${end.y - arrowSize * Math.sin(arrowAngle + Math.PI / 6)}
          `}
          fill="var(--canvas-edge)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.52, delay: 0.42, ease: "easeOut" }}
        />
        <circle
          cx={start.x}
          cy={start.y}
          r={4}
          fill="var(--canvas-edge)"
          className="edge-handle"
        />
        <circle
          cx={end.x}
          cy={end.y}
          r={4}
          fill="var(--canvas-edge)"
          className="edge-handle"
        />
        {edge.label && (
          <text
            x={cpX}
            y={cpY - 8}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize={12}
            fontFamily="var(--font-family, sans-serif)"
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

          {/* Edge preview (being dragged to create new edge) */}
          {edgeDragSource && edgeDragTarget && (
            <line
              x1={edgeDragSource.x}
              y1={edgeDragSource.y}
              x2={edgeDragTarget.x}
              y2={edgeDragTarget.y}
              stroke="var(--canvas-edge)"
              strokeWidth={2}
              strokeLinecap="round"
              className="edge-dragging"
              pointerEvents="none"
            />
          )}

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
                  initial={{ scale: 0.8, opacity: 0 }}
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
                    fontFamily="var(--font-family, sans-serif)"
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
                  initial={{ scale: 0, opacity: 0 }}
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
                  }}
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
                    className={
                      isAltPressed && hoveredNodeId === node.id
                        ? "node-connection-source"
                        : undefined
                    }
                  />

                  {/* Node content */}
                  <foreignObject
                    x={node.x + 12}
                    y={node.y + 12}
                    width={node.width - 24}
                    height={
                      node.height - 24 - (nodeTags.length > 0 ? 20 : 0)
                    }
                  >
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
                          fontFamily: "var(--font-family, sans-serif)",
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
                              <span key={t.id} className="tag-pill">
                                {t.tag}
                              </span>
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

                  {/* Render overlay (e.g. shockwave) */}
                  {renderNodeOverlay?.(node)}
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
    </div>
  );
}
