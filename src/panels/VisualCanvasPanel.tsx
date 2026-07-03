import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelContext } from "../PanelContext";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { safeInvoke } from "../safeInvoke";

// Undo/Redo command types
type CanvasCommand =
  | {
      type: "create_node";
      node: CanvasNode;
    }
  | {
      type: "update_node";
      nodeId: string;
      before: { content: string; x: number; y: number };
      after: { content: string; x: number; y: number };
    }
  | {
      type: "delete_node";
      node: CanvasNode;
    }
  | {
      type: "move_node";
      nodeId: string;
      beforeX: number;
      beforeY: number;
      afterX: number;
      afterY: number;
    };

const MAX_UNDO_STACK = 50;

interface VisualCanvas {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface CanvasNode {
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

interface CanvasEdge {
  id: string;
  canvas_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface CanvasGroup {
  id: string;
  canvas_id: string;
  label: string;
  node_ids_json: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface CanvasTag {
  id: string;
  node_id: string;
  tag: string;
  created_at: string;
}

// Zoom limits
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5.0;

function VisualCanvasPanel({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelContext();
  const [canvases, setCanvases] = useState<VisualCanvas[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [groups, setGroups] = useState<CanvasGroup[]>([]);
  const [tags, setTags] = useState<CanvasTag[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewport state (pan and zoom)
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  // Drag state
  const [dragState, setDragState] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
    // For multi-node drag: store original positions of all selected nodes
    multiNodeStarts?: Map<string, { x: number; y: number }>;
  } | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection state (multi-select)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [deletingNodeIds, setDeletingNodeIds] = useState<Set<string>>(new Set());

  // Box-select (rubber band) state
  const [boxSelect, setBoxSelect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  // Edge drag state (for creating new edges)
  const [edgeDragState, setEdgeDragState] = useState<{
    sourceNodeId: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  } | null>(null);

  // Space key held for panning
  const isSpacePressedRef = useRef(false);

  // Alt key held for edge creation mode
  const isAltPressedRef = useRef(false);
  const [isAltPressed, setIsAltPressed] = useState(false);

  // Hovered node id (for connection source breathe effect)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Flag to prevent handleCanvasClick from clearing selection after box-select
  const justCompletedBoxSelectRef = useRef(false);

  // Inline edit state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Shockwave effect: track newly created node IDs
  const [newlyCreatedNodeIds, setNewlyCreatedNodeIds] = useState<Set<string>>(new Set());
  const prevNodeIdsRef = useRef<Set<string>>(new Set());

  // Tag enter animation: track newly added tag IDs
  const [newlyAddedTagIds, setNewlyAddedTagIds] = useState<Set<string>>(new Set());
  const prevTagIdsRef = useRef<Set<string>>(new Set());

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState<CanvasCommand[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasCommand[]>([]);
  const undoStackRef = useRef<CanvasCommand[]>([]);
  const redoStackRef = useRef<CanvasCommand[]>([]);

  // Toast notification state
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 1500);
  }, []);

  // Clear undo/redo stacks and selection when switching canvases
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setSelectedNodeIds(new Set());
  }, [selectedCanvasId]);

  // Push command to undo stack
  const pushUndo = useCallback((command: CanvasCommand) => {
    setUndoStack((prev) => {
      const next = [...prev, command].slice(-MAX_UNDO_STACK);
      undoStackRef.current = next;
      return next;
    });
    // Clear redo stack on new command
    setRedoStack([]);
    redoStackRef.current = [];
  }, []);

  // Execute an undo command (reverse)
  const executeUndo = useCallback(async (command: CanvasCommand): Promise<boolean> => {
    try {
      switch (command.type) {
        case "create_node": {
          // Undo create = delete the node
          await safeInvoke("delete_canvas_node", { id: command.node.id });
          setNodes((prev) => prev.filter((n) => n.id !== command.node.id));
          return true;
        }
        case "update_node":
        case "move_node": {
          // Undo update/move = restore previous state
          const nodeId = command.type === "update_node" ? command.nodeId : command.nodeId;
          const before = command.type === "update_node" ? command.before : { content: "", x: command.beforeX, y: command.beforeY };

          // For update_node, we need to find the current node to get its content for non-updated fields
          let contentToRestore = before.content;
          let xToRestore = before.x;
          let yToRestore = before.y;

          if (command.type === "update_node") {
            // For update commands, before contains the old content and position
            // We need the current node's content/position for fields that weren't changed
            const currentNode = nodes.find((n) => n.id === nodeId);
            if (currentNode) {
              contentToRestore = before.content;
              xToRestore = before.x;
              yToRestore = before.y;
            }
          }

          await safeInvoke("update_canvas_node", {
            id: nodeId,
            content: contentToRestore,
            x: xToRestore,
            y: yToRestore,
            width: null,
            height: null,
            metadataJson: null,
          });

          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, content: contentToRestore, x: xToRestore, y: yToRestore }
                : n
            )
          );
          return true;
        }
        case "delete_node": {
          // Undo delete = recreate the node
          const newNode = await safeInvoke<CanvasNode>("create_canvas_node", {
            canvasId: command.node.canvas_id,
            content: command.node.content,
            x: command.node.x,
            y: command.node.y,
            width: command.node.width,
            height: command.node.height,
            metadataJson: command.node.metadata_json,
          });
          setNodes((prev) => [...prev, newNode]);
          // Trigger shockwave for recreated node
          setNewlyCreatedNodeIds((prev) => new Set(prev).add(newNode.id));
          setTimeout(() => {
            setNewlyCreatedNodeIds((prev) => {
              const next = new Set(prev);
              next.delete(newNode.id);
              return next;
            });
          }, 1400);
          return true;
        }
      }
    } catch (err) {
      console.error("Failed to execute undo:", err);
      showToast("Undo failed");
      return false;
    }
    return false;
  }, [nodes, showToast]);

  // Execute a redo command (reapply)
  const executeRedo = useCallback(async (command: CanvasCommand): Promise<boolean> => {
    try {
      switch (command.type) {
        case "create_node": {
          // Redo create = recreate the node
          const newNode = await safeInvoke<CanvasNode>("create_canvas_node", {
            canvasId: command.node.canvas_id,
            content: command.node.content,
            x: command.node.x,
            y: command.node.y,
            width: command.node.width,
            height: command.node.height,
            metadataJson: command.node.metadata_json,
          });
          setNodes((prev) => [...prev, newNode]);
          // Trigger shockwave for recreated node
          setNewlyCreatedNodeIds((prev) => new Set(prev).add(newNode.id));
          setTimeout(() => {
            setNewlyCreatedNodeIds((prev) => {
              const next = new Set(prev);
              next.delete(newNode.id);
              return next;
            });
          }, 1400);
          return true;
        }
        case "update_node":
        case "move_node": {
          // Redo update/move = apply the after state
          const nodeId = command.nodeId;
          let contentToApply: string;
          let xToApply: number;
          let yToApply: number;

          if (command.type === "update_node") {
            contentToApply = command.after.content;
            xToApply = command.after.x;
            yToApply = command.after.y;
          } else {
            // move_node: get current node content, apply new position
            const currentNode = nodes.find((n) => n.id === nodeId);
            contentToApply = currentNode?.content ?? "";
            xToApply = command.afterX;
            yToApply = command.afterY;
          }

          await safeInvoke("update_canvas_node", {
            id: nodeId,
            content: contentToApply,
            x: xToApply,
            y: yToApply,
            width: null,
            height: null,
            metadataJson: null,
          });

          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, content: contentToApply, x: xToApply, y: yToApply }
                : n
            )
          );
          return true;
        }
        case "delete_node": {
          // Redo delete = delete the node
          await safeInvoke("delete_canvas_node", { id: command.node.id });
          setNodes((prev) => prev.filter((n) => n.id !== command.node.id));
          return true;
        }
      }
    } catch (err) {
      console.error("Failed to execute redo:", err);
      showToast("Redo failed");
      return false;
    }
    return false;
  }, [nodes, showToast]);

  // Undo handler
  const handleUndo = useCallback(async () => {
    const currentUndo = undoStackRef.current;
    if (currentUndo.length === 0) return;

    const command = currentUndo[currentUndo.length - 1];
    const success = await executeUndo(command);

    if (success) {
      setUndoStack((prev) => {
        const next = prev.slice(0, -1);
        undoStackRef.current = next;
        return next;
      });
      setRedoStack((prev) => {
        const next = [...prev, command];
        redoStackRef.current = next;
        return next;
      });
      showToast(`Undid ${command.type.replace(/_/g, " ")}`);
    }
  }, [executeUndo, showToast]);

  // Redo handler
  const handleRedo = useCallback(async () => {
    const currentRedo = redoStackRef.current;
    if (currentRedo.length === 0) return;

    const command = currentRedo[currentRedo.length - 1];
    const success = await executeRedo(command);

    if (success) {
      setRedoStack((prev) => {
        const next = prev.slice(0, -1);
        redoStackRef.current = next;
        return next;
      });
      setUndoStack((prev) => {
        const next = [...prev, command];
        undoStackRef.current = next;
        return next;
      });
      showToast(`Redid ${command.type.replace(/_/g, " ")}`);
    }
  }, [executeRedo, showToast]);

  const fetchCanvases = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    safeInvoke<VisualCanvas[]>("list_visual_canvases", { sessionId })
      .then((data) => {
        setCanvases(data);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [sessionId]);

  const fetchNodes = useCallback(() => {
    if (!selectedCanvasId) {
      setNodes([]);
      prevNodeIdsRef.current = new Set();
      return;
    }
    safeInvoke<CanvasNode[]>("list_canvas_nodes", { canvasId: selectedCanvasId })
      .then((data) => {
        // Detect newly created nodes (IDs not in previous set)
        const newIds = data.filter((n) => !prevNodeIdsRef.current.has(n.id)).map((n) => n.id);
        if (newIds.length > 0) {
          setNewlyCreatedNodeIds((prev) => {
            const next = new Set(prev);
            for (const id of newIds) next.add(id);
            return next;
          });
          // Remove from shockwave set after animation completes
          setTimeout(() => {
            setNewlyCreatedNodeIds((prev) => {
              const next = new Set(prev);
              for (const id of newIds) next.delete(id);
              return next;
            });
          }, 1400);
        }
        prevNodeIdsRef.current = new Set(data.map((n) => n.id));
        setNodes(data);
      })
      .catch((err) => {
        console.error("Failed to fetch nodes:", err);
      });
  }, [selectedCanvasId]);

  const fetchEdges = useCallback(() => {
    if (!selectedCanvasId) {
      setEdges([]);
      return;
    }
    safeInvoke<CanvasEdge[]>("list_canvas_edges", { canvasId: selectedCanvasId })
      .then((data) => {
        setEdges(data);
      })
      .catch((err) => {
        console.error("Failed to fetch edges:", err);
      });
  }, [selectedCanvasId]);

  const fetchGroups = useCallback(() => {
    if (!selectedCanvasId) {
      setGroups([]);
      return;
    }
    safeInvoke<CanvasGroup[]>("list_canvas_groups", { canvasId: selectedCanvasId })
      .then((data) => {
        setGroups(data);
      })
      .catch((err) => {
        console.error("Failed to fetch groups:", err);
      });
  }, [selectedCanvasId]);

  const fetchTags = useCallback(() => {
    if (!selectedCanvasId) {
      setTags([]);
      prevTagIdsRef.current = new Set();
      return;
    }
    safeInvoke<CanvasTag[]>("list_canvas_tags_by_canvas", { canvasId: selectedCanvasId })
      .then((data) => {
        // Detect newly added tags (IDs not in previous set)
        const newIds = data.filter((t) => !prevTagIdsRef.current.has(t.id)).map((t) => t.id);
        if (newIds.length > 0) {
          setNewlyAddedTagIds((prev) => {
            const next = new Set(prev);
            for (const id of newIds) next.add(id);
            return next;
          });
          // Remove from animation set after animation completes
          setTimeout(() => {
            setNewlyAddedTagIds((prev) => {
              const next = new Set(prev);
              for (const id of newIds) next.delete(id);
              return next;
            });
          }, 300); // Slightly longer than 0.26s to ensure animation completes
        }
        prevTagIdsRef.current = new Set(data.map((t) => t.id));
        setTags(data);
      })
      .catch((err) => {
        console.error("Failed to fetch tags:", err);
      });
  }, [selectedCanvasId]);

  // Load view state for the selected canvas
  const loadViewState = useCallback(() => {
    if (!selectedCanvasId) return;
    safeInvoke<{ offset_x: number; offset_y: number; zoom: number } | null>(
      "get_canvas_view_state",
      { canvasId: selectedCanvasId },
    ).then((state) => {
      if (state) {
        setOffsetX(state.offset_x);
        setOffsetY(state.offset_y);
        setZoom(state.zoom);
      } else {
        setOffsetX(0);
        setOffsetY(0);
        setZoom(1);
      }
    }).catch((err) => {
      console.error("Failed to load view state:", err);
    });
  }, [selectedCanvasId]);

  // Debounced view state save
  const viewStateSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveViewState = useCallback((ox: number, oy: number, z: number) => {
    if (!selectedCanvasId) return;
    if (viewStateSaveRef.current) {
      clearTimeout(viewStateSaveRef.current);
    }
    viewStateSaveRef.current = setTimeout(() => {
      safeInvoke("update_canvas_view_state", {
        canvasId: selectedCanvasId,
        offsetX: ox,
        offsetY: oy,
        zoom: z,
      }).catch((err) => {
        console.error("Failed to save view state:", err);
      });
    }, 300); // 300ms debounce
  }, [selectedCanvasId]);

  // Pan handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    // Check if the target is the viewport container itself or the SVG
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]')) return;

    e.preventDefault();
    setEditingNodeId(null);
    setEditingValue("");

    if (isSpacePressedRef.current) {
      // Space + left drag = pan
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX,
        offsetY,
      };
      // Clear selection on pan
      setSelectedNodeIds(new Set());
    } else {
      // Left drag on empty canvas = box-select
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;
      setBoxSelect({ startX: svgX, startY: svgY, endX: svgX, endY: svgY });
    }
  }, [offsetX, offsetY]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    const newOffsetX = panStartRef.current.offsetX + dx;
    const newOffsetY = panStartRef.current.offsetY + dy;
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
  }, [isPanning]);

  const handlePanEnd = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      saveViewState(offsetX, offsetY, zoom);
    }
  }, [isPanning, offsetX, offsetY, zoom, saveViewState]);

  // Box-select: update rubber band on mouse move
  const handleBoxSelectMove = useCallback((e: React.MouseEvent) => {
    if (!boxSelect) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    setBoxSelect((prev) => prev ? { ...prev, endX: svgX, endY: svgY } : null);
  }, [boxSelect]);

  // Box-select: complete selection on mouse up
  const handleBoxSelectEnd = useCallback(() => {
    if (!boxSelect) return;

    const viewportRect = viewportRef.current?.getBoundingClientRect();
    if (!viewportRect) {
      setBoxSelect(null);
      return;
    }

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

  // Zoom handler (mouse wheel)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Clear edit mode and selection when zooming
    setEditingNodeId(null);
    setEditingValue("");
    setSelectedNodeIds(new Set());

    // Mouse position relative to viewport
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate new zoom level
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * delta));

    // Adjust offset so the point under the cursor stays fixed
    const scale = newZoom / zoom;
    const newOffsetX = mouseX - (mouseX - offsetX) * scale;
    const newOffsetY = mouseY - (mouseY - offsetY) * scale;

    setZoom(newZoom);
    setOffsetX(newOffsetX);
    setOffsetY(newOffsetY);
    saveViewState(newOffsetX, newOffsetY, newZoom);
  }, [zoom, offsetX, offsetY, saveViewState]);

  // Load view state when canvas is selected
  useEffect(() => {
    loadViewState();
  }, [loadViewState]);

  // Reset view state when deselecting canvas
  useEffect(() => {
    if (!selectedCanvasId) {
      setOffsetX(0);
      setOffsetY(0);
      setZoom(1);
    }
  }, [selectedCanvasId]);

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
    }, 100); // 100ms debounce
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

  // Start edge creation (called from node mouse down with Alt key)
  const handleEdgeDragStart = useCallback((e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    e.preventDefault();
    // Calculate source point (center of node)
    const sourceX = node.x + node.width / 2;
    const sourceY = node.y + node.height / 2;
    setEdgeDragState({
      sourceNodeId: node.id,
      sourceX,
      sourceY,
      targetX: sourceX,
      targetY: sourceY,
    });
  }, []);

  // Update edge drag position
  const handleEdgeDragMove = useCallback((e: React.MouseEvent) => {
    if (!edgeDragState) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Convert screen coordinates to canvas coordinates
    const canvasX = (e.clientX - rect.left - offsetX) / zoom;
    const canvasY = (e.clientY - rect.top - offsetY) / zoom;
    setEdgeDragState((prev) => prev ? { ...prev, targetX: canvasX, targetY: canvasY } : null);
  }, [edgeDragState, offsetX, offsetY, zoom]);

  // Complete edge creation
  const handleEdgeDragEnd = useCallback((e: React.MouseEvent) => {
    if (!edgeDragState) return;
    // Find if we dropped on a node
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) {
      setEdgeDragState(null);
      return;
    }
    const canvasX = (e.clientX - rect.left - offsetX) / zoom;
    const canvasY = (e.clientY - rect.top - offsetY) / zoom;

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
    setEdgeDragState(null);
  }, [edgeDragState, offsetX, offsetY, zoom, nodes, selectedCanvasId, showToast]);

  // Handle mouse down on a node to start dragging or edge creation
  const handleNodeMouseDown = useCallback((
    e: React.MouseEvent,
    node: CanvasNode
  ) => {
    e.stopPropagation();
    e.preventDefault();

    // Only start drag with left mouse button
    if (e.button !== 0) return;

    // Alt + left click starts edge creation
    if (e.altKey) {
      handleEdgeDragStart(e, node);
      return;
    }

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
  }, [selectedNodeIds, nodes, handleEdgeDragStart]);

  // Handle mouse move on canvas
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    // Handle box-select rubber band
    if (boxSelect) {
      handleBoxSelectMove(e);
      return;
    }

    // Handle edge drag
    if (edgeDragState) {
      handleEdgeDragMove(e);
      return;
    }

    if (!dragState) return;

    const dx = (e.clientX - dragState.startX) / zoom;
    const dy = (e.clientY - dragState.startY) / zoom;

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
  }, [dragState, zoom, updateNodePosition, batchUpdatePositions, boxSelect, handleBoxSelectMove, edgeDragState, handleEdgeDragMove]);

  // Handle mouse up to end dragging
  const handleMouseUp = useCallback((e?: React.MouseEvent) => {
    if (dragThrottleRef.current) {
      clearTimeout(dragThrottleRef.current);
    }
    if (batchUpdatePositionsRef.current) {
      clearTimeout(batchUpdatePositionsRef.current);
    }

    // Complete edge drag if active
    if (edgeDragState && e) {
      handleEdgeDragEnd(e);
      return;
    }

    // Complete box-select if active
    if (boxSelect) {
      handleBoxSelectEnd();
    }

    // If we were dragging, record the move(s) for undo
    if (dragState) {
      if (dragState.multiNodeStarts) {
        // Multi-node drag undo: record moves for all dragged nodes
        for (const [nodeId, startPos] of dragState.multiNodeStarts) {
          const currentNode = nodes.find((n) => n.id === nodeId);
          if (currentNode) {
            const moved = currentNode.x !== startPos.x || currentNode.y !== startPos.y;
            if (moved) {
              pushUndo({
                type: "move_node",
                nodeId,
                beforeX: startPos.x,
                beforeY: startPos.y,
                afterX: currentNode.x,
                afterY: currentNode.y,
              });
            }
          }
        }
      } else {
        // Single node drag undo
        const currentNode = nodes.find((n) => n.id === dragState.nodeId);
        if (currentNode) {
          const moved = currentNode.x !== dragState.nodeStartX || currentNode.y !== dragState.nodeStartY;
          if (moved) {
            pushUndo({
              type: "move_node",
              nodeId: dragState.nodeId,
              beforeX: dragState.nodeStartX,
              beforeY: dragState.nodeStartY,
              afterX: currentNode.x,
              afterY: currentNode.y,
            });
          }
        }
      }
    }

    setDragState(null);
    setDraggedNodeId(null);
  }, [dragState, nodes, pushUndo, boxSelect, handleBoxSelectEnd, edgeDragState, handleEdgeDragEnd]);

  // Handle node click to select
  const handleNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
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

  // Enter edit mode on double-click
  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingNodeId(node.id);
    setEditingValue(node.content);
    // Clear selection when entering edit mode
    setSelectedNodeIds(new Set());
  }, []);

  // Confirm edit: save to database if content changed and is non-empty
  const confirmEdit = useCallback(() => {
    if (!editingNodeId) return;
    const node = nodes.find((n) => n.id === editingNodeId);
    if (!node) return;

    const trimmed = editingValue.trim();
    // Reject empty content
    if (trimmed.length === 0) {
      // Revert to original content
      setEditingNodeId(null);
      setEditingValue("");
      return;
    }

    // Only update if content actually changed
    if (trimmed !== node.content) {
      const oldContent = node.content;
      safeInvoke<CanvasNode>("update_canvas_node", {
        id: editingNodeId,
        content: trimmed,
        x: null,
        y: null,
        width: null,
        height: null,
        metadataJson: null,
      }).then((updatedNode) => {
        // Update local state with the saved content
        setNodes((prev) =>
          prev.map((n) => (n.id === editingNodeId ? updatedNode : n))
        );
        // Push undo command
        pushUndo({
          type: "update_node",
          nodeId: editingNodeId,
          before: { content: oldContent, x: node.x, y: node.y },
          after: { content: trimmed, x: node.x, y: node.y },
        });
      }).catch((err) => {
        console.error("Failed to update node content:", err);
      });
    }

    setEditingNodeId(null);
    setEditingValue("");
  }, [editingNodeId, editingValue, nodes, pushUndo]);

  // Cancel edit: revert to original content
  const cancelEdit = useCallback(() => {
    setEditingNodeId(null);
    setEditingValue("");
  }, []);

  // Handle keyboard in edit input
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }, [confirmEdit, cancelEdit]);

  // Handle click on empty canvas to deselect and clear edit
  const handleCanvasClick = useCallback(() => {
    // Don't clear selection if we just completed a box-select
    if (justCompletedBoxSelectRef.current) return;
    setSelectedNodeIds(new Set());
    setEditingNodeId(null);
    setEditingValue("");
  }, []);

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

  // Keyboard listener for Delete key, Escape, and undo/redo shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo shortcuts (Cmd+Z, Cmd+Shift+Z)
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (modifier && (e.key === "Z" || (e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        // Only delete if not typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        deleteSelectedNodes();
      }

      if (e.key === "Escape") {
        // Cancel edge drag if active
        if (edgeDragState) {
          setEdgeDragState(null);
          return;
        }
        setSelectedNodeIds(new Set());
        setEditingNodeId(null);
        setEditingValue("");
      }

      if (e.key === " " && !e.repeat) {
        // Space key for panning - prevent scroll
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          isSpacePressedRef.current = true;
        }
      }

      if (e.key === "Alt") {
        isAltPressedRef.current = true;
        setIsAltPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        isSpacePressedRef.current = false;
      }
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
  }, [deleteSelectedNodes, handleUndo, handleRedo, edgeDragState]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  useEffect(() => {
    fetchEdges();
  }, [fetchEdges]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Global mouse up handler to clear drag/pan/select state
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragThrottleRef.current) {
        clearTimeout(dragThrottleRef.current);
      }
      if (batchUpdatePositionsRef.current) {
        clearTimeout(batchUpdatePositionsRef.current);
      }
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        saveViewState(offsetX, offsetY, zoom);
      }
      if (boxSelect) {
        handleBoxSelectEnd();
      }
      setEdgeDragState(null);
      setDragState(null);
      setDraggedNodeId(null);
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      if (dragThrottleRef.current) {
        clearTimeout(dragThrottleRef.current);
      }
      if (batchUpdatePositionsRef.current) {
        clearTimeout(batchUpdatePositionsRef.current);
      }
    };
  }, [isPanning, offsetX, offsetY, zoom, saveViewState, boxSelect, handleBoxSelectEnd]);

  useTauriEvent<{ session_id: string }>(
    "visual-canvases-changed",
    useCallback((payload) => {
      if (payload.session_id === sessionId) {
        fetchCanvases();
      }
    }, [sessionId, fetchCanvases]),
  );

  useTauriEvent<{ session_id: string; canvas_id: string }>(
    "canvas-nodes-changed",
    useCallback((payload) => {
      if (payload.session_id === sessionId && payload.canvas_id === selectedCanvasId) {
        fetchNodes();
      }
    }, [sessionId, selectedCanvasId, fetchNodes]),
  );

  useTauriEvent<{ session_id: string; canvas_id: string }>(
    "canvas-edges-changed",
    useCallback((payload) => {
      if (payload.session_id === sessionId && payload.canvas_id === selectedCanvasId) {
        fetchEdges();
      }
    }, [sessionId, selectedCanvasId, fetchEdges]),
  );

  useTauriEvent<{ session_id: string; canvas_id: string }>(
    "canvas-groups-changed",
    useCallback((payload) => {
      if (payload.session_id === sessionId && payload.canvas_id === selectedCanvasId) {
        fetchGroups();
      }
    }, [sessionId, selectedCanvasId, fetchGroups]),
  );

  useTauriEvent<{ session_id: string; canvas_id: string }>(
    "canvas-tags-changed",
    useCallback((payload) => {
      if (payload.session_id === sessionId && payload.canvas_id === selectedCanvasId) {
        fetchTags();
      }
    }, [sessionId, selectedCanvasId, fetchTags]),
  );

  // Auto-focus and select all text when entering edit mode
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      const input = editInputRef.current;
      // Use requestAnimationFrame to ensure the input is mounted
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }
  }, [editingNodeId]);

  if (loading && canvases.length === 0) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted, #888)", fontSize: 13 }}>
        Loading canvases...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: "var(--error, #f48771)", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  // If no canvas is selected, show the canvas list
  if (!selectedCanvasId) {
    if (canvases.length === 0) {
      return (
        <div style={{
          padding: 16,
          color: "var(--text-muted, #888)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 8,
        }}>
          <div style={{ fontSize: 24, opacity: 0.5 }}>&#9633;</div>
          <div>No canvases yet. Ask the AI to create one.</div>
        </div>
      );
    }

    return (
      <div style={{ padding: 8, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
        <AnimatePresence mode="popLayout">
          {canvases.map((canvas, idx) => (
            <motion.div
              key={canvas.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.2,
                delay: idx * 0.03,
                ease: [0.2, 0, 0, 1],
              }}
              style={{
                padding: "8px 12px",
                marginBottom: 4,
                borderRadius: 6,
                border: "1px solid var(--border, #3c3c3c)",
                background: "var(--bg-secondary, #222)",
                cursor: "pointer",
              }}
              onClick={() => setSelectedCanvasId(canvas.id)}
            >
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {canvas.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted, #888)", marginTop: 2 }}>
                Created {new Date(canvas.created_at).toLocaleDateString()}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  // Show the canvas with nodes
  const selectedCanvas = canvases.find(c => c.id === selectedCanvasId);

  // Get unique tags for the filter bar
  const uniqueTags = [...new Set(tags.map(t => t.tag))].sort();

  // Filter nodes by active tag
  const filteredNodes = activeTagFilter
    ? nodes.filter(node => tags.some(t => t.node_id === node.id && t.tag === activeTagFilter))
    : nodes;

  // Filter edges to only show edges between filtered nodes
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = activeTagFilter
    ? edges.filter(e => filteredNodeIds.has(e.source_node_id) && filteredNodeIds.has(e.target_node_id))
    : edges;

  return (
    <div className="visual-canvas-panel" style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* ── Design Tokens ── */}
      <style>{`
        .visual-canvas-panel {
          /* Animation timing */
          --canvas-duration-fast: .15s;
          --canvas-duration-normal: .26s;
          --canvas-duration-slow: .62s;

          /* Animation easing */
          --canvas-ease-state: cubic-bezier(.2,.8,.2,1);
          --canvas-ease-spring: cubic-bezier(.19,1.42,.36,1);
          --canvas-ease-spring-subtle: cubic-bezier(.16,1,.3,1);

          /* Edge animation tokens */
          --canvas-edge-dash-array: 6 6;
          --canvas-edge-dash-speed: .68s;

          /* Colors */
          --canvas-bg: #0b090f;
          --canvas-node-bg: #1f1828;
          --canvas-node-border: #7c3aed55;
          --canvas-node-selected: #7c3aed;
          --canvas-edge-color: #7c3aed;
          --canvas-accent: #9b6cb9;
          --canvas-accent-bright: #c6a7d8;

          /* Radii */
          --canvas-radius-node: 10px;
          --canvas-radius-tag: 8px;
          --canvas-radius-group: 14px;
        }

        @keyframes edge-drag-flow {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -22px; }
        }

        .edge-dragging {
          stroke-dasharray: var(--canvas-edge-dash-array);
          animation: edge-drag-flow var(--canvas-edge-dash-speed) linear infinite;
        }

        @keyframes edge-handle-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }

        .edge-handle {
          animation: edge-handle-bob 3s ease-in-out infinite;
          cursor: grab;
        }

        .edge-handle:hover {
          animation-play-state: paused;
          transform: scale(1.2);
          transition: transform var(--canvas-duration-fast) var(--canvas-ease-state);
        }

        @keyframes node-shockwave-scale {
          0% {
            animation-timing-function: cubic-bezier(.16,1,.3,1);
            transform: translate(-50%, -50%) scale(1);
          }
          34% {
            transform: translate(-50%, -50%) scale(2.2);
            animation-timing-function: cubic-bezier(.19,1,.22,1);
          }
          60% {
            animation-timing-function: cubic-bezier(.22,1,.36,1);
            transform: translate(-50%, -50%) scale(1.72);
          }
          82% {
            animation-timing-function: cubic-bezier(.22,1,.36,1);
            transform: translate(-50%, -50%) scale(1.16);
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes node-shockwave-fade {
          0% { opacity: 0; }
          14% { opacity: 0.88; }
          46% { opacity: 0.62; }
          78% { opacity: 0.22; }
          100% { opacity: 0; }
        }

        .node-shockwave {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 26px;
          height: 26px;
          margin: -13px 0 0 -13px;
          border-radius: 50%;
          border: 1.5px solid var(--canvas-accent);
          background: var(--canvas-accent);
          opacity: 0;
          pointer-events: none;
          animation:
            node-shockwave-scale 1.32s cubic-bezier(.16,1,.3,1) both,
            node-shockwave-fade 1.38s cubic-bezier(.22,1,.36,1) both;
        }

        @keyframes node-connection-breathe {
          0%, 100% {
            opacity: 0.78;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.025);
          }
        }

        .node-connection-source {
          animation: node-connection-breathe 1.5s ease-in-out infinite;
        }

        @keyframes tag-enter {
          0% {
            opacity: 0;
            transform: translateY(5px) scale(0.92);
          }
          62% {
            opacity: 1;
            transform: translateY(-1px) scale(1.045);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .tag-pill {
          padding: 1px 6px;
          border-radius: var(--canvas-radius-tag);
          background: var(--canvas-accent);
          color: #fff;
          font-size: 9px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tag-pill-enter {
          animation: tag-enter 0.26s cubic-bezier(.16,1,.3,1) both;
        }
      `}</style>

      {/* Header with back button */}
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border, #3c3c3c)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <button
          onClick={() => setSelectedCanvasId(null)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted, #888)",
            cursor: "pointer",
            padding: 4,
            fontSize: 14,
          }}
        >
          &larr;
        </button>
        <div style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>
          {selectedCanvas?.name || "Canvas"}
        </div>
        {/* Zoom indicator and reset */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted, #888)" }}>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => {
              setOffsetX(0);
              setOffsetY(0);
              setZoom(1);
              if (selectedCanvasId) {
                safeInvoke("update_canvas_view_state", {
                  canvasId: selectedCanvasId,
                  offsetX: 0,
                  offsetY: 0,
                  zoom: 1,
                }).catch((err) => {
                  console.error("Failed to reset view state:", err);
                });
              }
            }}
            style={{
              background: "none",
              border: "1px solid var(--border, #3c3c3c)",
              borderRadius: 4,
              color: "var(--text-muted, #888)",
              cursor: "pointer",
              padding: "2px 6px",
              fontSize: 11,
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Tag filter bar */}
      {uniqueTags.length > 0 && (
        <div style={{
          padding: "6px 12px",
          borderBottom: "1px solid var(--border, #3c3c3c)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted, #888)", marginRight: 4 }}>
            Filter:
          </span>
          <button
            onClick={() => setActiveTagFilter(null)}
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              border: "1px solid var(--border, #3c3c3c)",
              background: !activeTagFilter ? "var(--canvas-accent)" : "transparent",
              color: !activeTagFilter ? "#fff" : "var(--text-muted, #888)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            All
          </button>
          {uniqueTags.map(tag => (
            <motion.button
              key={tag}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
                duration: 0.26,
              }}
              onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
              style={{
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid var(--border, #3c3c3c)",
                background: activeTagFilter === tag ? "var(--canvas-accent)" : "transparent",
                color: activeTagFilter === tag ? "#fff" : "var(--text-muted, #888)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {tag}
            </motion.button>
          ))}
        </div>
      )}

      {/* SVG Canvas */}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          cursor: isPanning ? "grabbing" : isSpacePressedRef.current ? "grab" : dragState ? "grabbing" : "default",
        }}
        onMouseDown={handlePanStart}
        onMouseMove={(e) => { handlePanMove(e); handleCanvasMouseMove(e); }}
        onMouseUp={() => { handlePanEnd(); handleMouseUp(); }}
        onMouseLeave={() => { handlePanEnd(); handleMouseUp(); }}
        onWheel={handleWheel}
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
          {/* Grid pattern - moves with content via parent <g> transform */}
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
                stroke="var(--border, #3c3c3c)"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
          </defs>
          <rect x={-10000} y={-10000} width={20000} height={20000} fill="url(#grid)" />

          {/* Edges */}
          <AnimatePresence>
            {filteredEdges.map((edge) => {
              const sourceNode = nodes.find(n => n.id === edge.source_node_id);
              const targetNode = nodes.find(n => n.id === edge.target_node_id);
              if (!sourceNode || !targetNode) return null;

              // Calculate center points of nodes
              const sourceX = sourceNode.x + sourceNode.width / 2;
              const sourceY = sourceNode.y + sourceNode.height / 2;
              const targetX = targetNode.x + targetNode.width / 2;
              const targetY = targetNode.y + targetNode.height / 2;

              // Calculate control points for a curved path
              const dx = targetX - sourceX;
              const dy = targetY - sourceY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const curvature = Math.min(dist * 0.2, 50);

              // Perpendicular offset for curve
              const nx = -dy / dist;
              const ny = dx / dist;
              const cpX = (sourceX + targetX) / 2 + nx * curvature;
              const cpY = (sourceY + targetY) / 2 + ny * curvature;

              // Calculate edge intersection points with node boundaries
              const getEdgePoint = (node: CanvasNode, targetX: number, targetY: number) => {
                const cx = node.x + node.width / 2;
                const cy = node.y + node.height / 2;
                const dx = targetX - cx;
                const dy = targetY - cy;
                const angle = Math.atan2(dy, dx);
                
                // Calculate intersection with rectangle
                const hw = node.width / 2;
                const hh = node.height / 2;
                const tanAngle = Math.abs(Math.tan(angle));
                
                let ix: number, iy: number;
                if (tanAngle * hw <= hh) {
                  // Intersects left or right side
                  ix = dx > 0 ? hw : -hw;
                  iy = ix * Math.tan(angle);
                } else {
                  // Intersects top or bottom
                  iy = dy > 0 ? hh : -hh;
                  ix = iy / Math.tan(angle);
                }
                
                return { x: cx + ix, y: cy + iy };
              };

              const start = getEdgePoint(sourceNode, cpX, cpY);
              const end = getEdgePoint(targetNode, cpX, cpY);

              // Create curved path
              const path = `M ${start.x} ${start.y} Q ${cpX} ${cpY} ${end.x} ${end.y}`;

              // Calculate arrowhead
              const arrowSize = 10;
              const t = 0.98; // Point near the end
              const arrowX = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cpX + t * t * end.x;
              const arrowY = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cpY + t * t * end.y;
              const arrowAngle = Math.atan2(end.y - arrowY, end.x - arrowX);

              return (
                <motion.g
                  key={edge.id}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.26, ease: "linear" }}
                >
                  {/* Edge path */}
                  <motion.path
                    d={path}
                    fill="none"
                    stroke="var(--canvas-edge-color)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.42, ease: "easeOut" }}
                  />
                  {/* Arrowhead */}
                  <motion.polygon
                    points={`
                      ${end.x},${end.y}
                      ${end.x - arrowSize * Math.cos(arrowAngle - Math.PI / 6)},${end.y - arrowSize * Math.sin(arrowAngle - Math.PI / 6)}
                      ${end.x - arrowSize * Math.cos(arrowAngle + Math.PI / 6)},${end.y - arrowSize * Math.sin(arrowAngle + Math.PI / 6)}
                    `}
                    fill="var(--canvas-edge-color)"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.52, delay: 0.42, ease: "easeOut" }}
                  />
                  {/* Edge handles (start and end circles) */}
                  <circle
                    cx={start.x}
                    cy={start.y}
                    r={4}
                    fill="var(--canvas-edge-color)"
                    className="edge-handle"
                  />
                  <circle
                    cx={end.x}
                    cy={end.y}
                    r={4}
                    fill="var(--canvas-edge-color)"
                    className="edge-handle"
                  />
                  {/* Label */}
                  {edge.label && (
                    <text
                      x={cpX}
                      y={cpY - 8}
                      textAnchor="middle"
                      fill="var(--text-muted, #888)"
                      fontSize={12}
                      fontFamily="var(--font-family, sans-serif)"
                    >
                      {edge.label}
                    </text>
                  )}
                </motion.g>
              );
            })}
          </AnimatePresence>

          {/* Edge preview (being dragged to create new edge) */}
          {edgeDragState && (
            <line
              x1={edgeDragState.sourceX}
              y1={edgeDragState.sourceY}
              x2={edgeDragState.targetX}
              y2={edgeDragState.targetY}
              stroke="var(--canvas-edge-color)"
              strokeWidth={2}
              strokeLinecap="round"
              className="edge-dragging"
              pointerEvents="none"
            />
          )}

          {/* Groups - render behind nodes */}
          <AnimatePresence>
            {groups.map((group) => {
              const nodeIds: string[] = JSON.parse(group.node_ids_json || "[]");
              const memberNodes = nodes.filter((n) => nodeIds.includes(n.id));
              if (memberNodes.length === 0) return null;

              // Calculate bounding box of member nodes
              const padding = 20;
              const minX = Math.min(...memberNodes.map((n) => n.x)) - padding;
              const minY = Math.min(...memberNodes.map((n) => n.y)) - padding;
              const maxX = Math.max(...memberNodes.map((n) => n.x + n.width)) + padding;
              const maxY = Math.max(...memberNodes.map((n) => n.y + n.height)) + padding;
              const groupWidth = maxX - minX;
              const groupHeight = maxY - minY;

              return (
                <motion.g
                  key={group.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.26,
                    ease: "linear",
                  }}
                >
                  {/* Group frame */}
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
                  {/* Group label */}
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
            {filteredNodes.map((node) => {
              const isDragging = draggedNodeId === node.id;
              const isSelected = selectedNodeIds.has(node.id);
              const isDeleting = deletingNodeIds.has(node.id);
              const isEditing = editingNodeId === node.id;
              const nodeTags = tags.filter(t => t.node_id === node.id);
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
                  transition={isDeleting ? {
                    duration: 0.26,
                    ease: "linear",
                  } : {
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    duration: 0.62,
                  }}
                  style={{
                    cursor: isEditing ? "text" : isDragging ? "grabbing" : "grab",
                    pointerEvents: isDragging || isDeleting ? "none" : "auto",
                  }}
                  onMouseDown={(e) => { if (!isEditing) handleNodeMouseDown(e, node); }}
                  onClick={(e) => { if (!isEditing) handleNodeClick(e, node.id); }}
                  onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
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
                    stroke={isDragging ? "var(--canvas-node-selected)" : isSelected ? "var(--canvas-node-selected)" : isEditing ? "var(--canvas-node-selected)" : "var(--canvas-node-border)"}
                    strokeWidth={isDragging || isEditing ? 2 : isSelected ? 2 : 1}
                    filter={isDragging ? "url(#drop-shadow)" : undefined}
                    className={isAltPressed && hoveredNodeId === node.id ? "node-connection-source" : undefined}
                  />
                  {/* Node content */}
                  <foreignObject
                    x={node.x + 12}
                    y={node.y + 12}
                    width={node.width - 24}
                    height={node.height - 24 - (nodeTags.length > 0 ? 20 : 0)}
                  >
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={confirmEdit}
                        autoFocus
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          color: "var(--text-primary, #fff)",
                          fontSize: 13,
                          lineHeight: 1.4,
                          fontFamily: "var(--font-family, sans-serif)",
                          padding: 0,
                          margin: 0,
                          boxSizing: "border-box",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          color: "var(--text-primary, #fff)",
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
                  {nodeTags.length > 0 && (
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
                          <span
                            key={t.id}
                            className={`tag-pill${newlyAddedTagIds.has(t.id) ? " tag-pill-enter" : ""}`}
                          >
                            {t.tag}
                          </span>
                        ))}
                        {nodeTags.length > 3 && (
                          <span style={{
                            fontSize: 9,
                            color: "var(--text-muted, #888)",
                            alignSelf: "center",
                          }}>
                            +{nodeTags.length - 3}
                          </span>
                        )}
                      </div>
                    </foreignObject>
                  )}
                  {/* Shockwave effect for newly created nodes */}
                  {newlyCreatedNodeIds.has(node.id) && (
                    <foreignObject
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      style={{ overflow: "visible", pointerEvents: "none" }}
                    >
                      <div className="node-shockwave" />
                    </foreignObject>
                  )}
                </motion.g>
              );
            })}
          </AnimatePresence>

          {/* Empty state */}
          {filteredNodes.length === 0 && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text-muted, #888)"
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
              fill="var(--canvas-edge-color)"
              fillOpacity={0.08}
              stroke="var(--canvas-edge-color)"
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

      {/* Selection count indicator */}
      {selectedNodeIds.size > 1 && (
        <div
          style={{
            position: "absolute",
            top: 56,
            right: 12,
            padding: "4px 10px",
            borderRadius: 6,
            background: "var(--canvas-accent)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 500,
            zIndex: 10,
          }}
        >
          {selectedNodeIds.size} selected
        </div>
      )}

      {/* Undo/Redo badge */}
      {(undoStack.length > 0 || redoStack.length > 0) && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            display: "flex",
            gap: 6,
            zIndex: 10,
          }}
        >
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border, #3c3c3c)",
              background: undoStack.length > 0 ? "var(--bg-secondary, #222)" : "var(--bg-primary, #1a1a1a)",
              color: undoStack.length > 0 ? "var(--text-primary, #fff)" : "var(--text-muted, #888)",
              fontSize: 11,
              cursor: undoStack.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>&#8630;</span>
            <span>{undoStack.length}</span>
          </motion.button>
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border, #3c3c3c)",
              background: redoStack.length > 0 ? "var(--bg-secondary, #222)" : "var(--bg-primary, #1a1a1a)",
              color: redoStack.length > 0 ? "var(--text-primary, #fff)" : "var(--text-muted, #888)",
              fontSize: 11,
              cursor: redoStack.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>&#8631;</span>
            <span>{redoStack.length}</span>
          </motion.button>
        </div>
      )}

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
              position: "absolute",
              bottom: 12,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "6px 14px",
              borderRadius: 8,
              background: "var(--bg-elevated, #333)",
              border: "1px solid var(--border, #3c3c3c)",
              color: "var(--text-primary, #fff)",
              fontSize: 12,
              fontWeight: 500,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              zIndex: 20,
              whiteSpace: "nowrap",
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

registerPanel("visual-canvas", "Visual Canvas", VisualCanvasPanel);

export default VisualCanvasPanel;
