import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelContext } from "../PanelContext";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { safeInvoke } from "../safeInvoke";
import { Badge, Button } from "../components/ui";
import { Plus, X } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";
import SearchBar from "../components/SearchBar";
import CanvasModal from "../CanvasModal";
import {
  CanvasRenderer,
  type CanvasNode,
  type CanvasEdge,
  type CanvasGroup,
} from "../components/CanvasRenderer";
import {
  useCanvasToast,
  useCanvasViewport,
  useCanvasUndoRedo,
  useCanvasSelection,
  useCanvasInlineEdit,
  useCanvasNodeDrag,
  useCanvasEdgeCreation,
  useCanvasRewire,
} from "../hooks/canvas";
import "../canvas/canvas-animations.css";
import "./VisualCanvasPanel.css";

interface VisualCanvas {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface CanvasTag {
  id: string;
  node_id: string;
  tag: string;
  created_at: string;
}

function VisualCanvasPanel({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelContext();
  const [canvases, setCanvases] = useState<VisualCanvas[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [groups, setGroups] = useState<CanvasGroup[]>([]);
  const [tags, setTags] = useState<CanvasTag[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [canvasModalOpen, setCanvasModalOpen] = useState<{ mode: "create" } | { mode: "rename"; canvas: VisualCanvas } | null>(null);
  const [canvasFilterQuery, setCanvasFilterQuery] = useState("");
  const canvasFilterInputRef = useRef<HTMLInputElement>(null);
  const canvasListRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tag enter animation: track newly added tag IDs
  const [newlyAddedTagIds, setNewlyAddedTagIds] = useState<Set<string>>(new Set());
  const prevTagIdsRef = useRef<Set<string>>(new Set());

  // ── Hooks ──────────────────────────────────────────────────────────────

  // Toast
  const { toast, showToast } = useCanvasToast();

  // Viewport (pan and zoom)
  const {
    offsetX, offsetY, zoom,
    setOffsetX, setOffsetY, setZoom,
    saveViewState,
  } = useCanvasViewport(selectedCanvasId);

  // Undo/Redo — needs nodesRef for reading current nodes in executeUndo/executeRedo
  const nodesRef = useRef<CanvasNode[]>([]);
  nodesRef.current = nodes;

  const {
    undoStack, redoStack,
    pushUndo, handleUndo, handleRedo,
  } = useCanvasUndoRedo({
    selectedCanvasId,
    nodesRef,
    setNodes,
    showToast,
  });

  // Selection (multi-select, box-select, delete)
  const {
    selectedNodeIds, setSelectedNodeIds,
    deletingNodeIds, setDeletingNodeIds,
    boxSelect,
    justCompletedBoxSelectRef,
    handleNodeClick,
    handleBoxSelectMove,
    handleBoxSelectEnd,
    deleteSelectedNodes,
  } = useCanvasSelection({
    nodes, offsetX, offsetY, zoom, pushUndo,
  });

  // Hovered node ID (for side handles)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Edge creation via handle drag-to-connect
  const {
    connectionDrag, ropePoints, dragOverNodeId, snappedMidpoint,
    startConnectionDrag, updateConnectionDrag, endConnectionDrag,
    connectionDragRef,
  } = useCanvasEdgeCreation({
    nodes, selectedCanvasId, showToast, setEdges,
    hoveredNodeId,
  });

  // Edge rewire via arrowhead grab
  const {
    rewire, rewireRopePoints, rewireDragOverNodeId, rewireSnappedMidpoint,
    startRewire, updateRewire, endRewire,
    rewireRef,
  } = useCanvasRewire({
    nodes, edges, selectedCanvasId, showToast, setEdges,
    hoveredNodeId,
  });

  // Inline edit
  const {
    editingNodeId, setEditingNodeId, editingValue, setEditingValue,
    editInputRef,
    handleNodeDoubleClick,
    confirmEdit, handleEditKeyDown,
  } = useCanvasInlineEdit({
    nodes, pushUndo, setNodes, setSelectedNodeIds,
  });

  // Node drag
  const {
    dragState, draggedNodeId,
    handleNodeMouseDown: dragHandleNodeMouseDown,
    handleDragMove,
    handleDragEnd,
    dragThrottleRef,
    batchUpdatePositionsRef,
  } = useCanvasNodeDrag({
    nodes, selectedNodeIds, zoom, setNodes,
  });

  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (connectionDragRef.current) return;
    dragHandleNodeMouseDown(nodeId, e);
  }, [connectionDragRef, dragHandleNodeMouseDown]);

  // Clear selection when switching canvases
  useEffect(() => {
    setSelectedNodeIds(new Set());
  }, [selectedCanvasId]);

  // Placement mode state (for ghost preview)
  const [placementMode, setPlacementMode] = useState<{
    type: 'node' | 'group';
    startX: number;
    startY: number;
  } | null>(null);
  const [cursorCanvasPos, setCursorCanvasPos] = useState<{ x: number; y: number } | null>(null);

  // Context menu state (right-click on empty canvas, node, edge, or group)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
    nodeId?: string;
    edgeId?: string;
    groupId?: string;
  } | null>(null);

  // Handle mouse move on canvas (dispatcher)
  const handleCanvasMouseMove = useCallback((canvasX: number, canvasY: number, viewportX: number, viewportY: number, e: React.MouseEvent) => {
    // Handle placement mode (ghost preview)
    if (placementMode) {
      setCursorCanvasPos({ x: canvasX, y: canvasY });
      return;
    }

    // Handle connection drag
    if (connectionDragRef.current) {
      updateConnectionDrag(canvasX, canvasY);
      return;
    }

    // Handle rewire drag
    if (rewireRef.current) {
      updateRewire(canvasX, canvasY);
      return;
    }

    // Handle box-select rubber band
    if (boxSelect) {
      handleBoxSelectMove(viewportX, viewportY);
      return;
    }

    if (!dragState) return;
    handleDragMove(e.clientX, e.clientY);
  }, [dragState, handleDragMove, boxSelect, handleBoxSelectMove, placementMode, connectionDragRef, updateConnectionDrag, rewireRef, updateRewire]);

  // Handle mouse up to end dragging
  const handleMouseUp = useCallback((canvasX: number, canvasY: number, _e: React.MouseEvent) => {
    // Complete box-select if active
    if (boxSelect) {
      handleBoxSelectEnd();
    }

    // Complete connection drag if active
    if (connectionDragRef.current) {
      endConnectionDrag(canvasX, canvasY);
      return;
    }

    // Complete rewire if active
    if (rewireRef.current) {
      endRewire(canvasX, canvasY);
      return;
    }

    // If we were dragging, record the move(s) for undo
    const dragSnapshot = handleDragEnd();
    if (dragSnapshot) {
      if (dragSnapshot.multiNodeStarts) {
        // Multi-node drag undo: record moves for all dragged nodes
        for (const [nodeId, startPos] of dragSnapshot.multiNodeStarts) {
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
        const currentNode = nodes.find((n) => n.id === dragSnapshot.nodeId);
        if (currentNode) {
          const moved = currentNode.x !== dragSnapshot.nodeStartX || currentNode.y !== dragSnapshot.nodeStartY;
          if (moved) {
            pushUndo({
              type: "move_node",
              nodeId: dragSnapshot.nodeId,
              beforeX: dragSnapshot.nodeStartX,
              beforeY: dragSnapshot.nodeStartY,
              afterX: currentNode.x,
              afterY: currentNode.y,
            });
          }
        }
      }
    }
  }, [dragState, nodes, pushUndo, boxSelect, handleBoxSelectEnd, handleDragEnd, connectionDragRef, endConnectionDrag, rewireRef, endRewire]);

  // ── Data fetching ──────────────────────────────────────────────────────

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
      return;
    }
    safeInvoke<CanvasNode[]>("list_canvas_nodes", { canvasId: selectedCanvasId })
      .then((data) => {
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
          }, 300);
        }
        prevTagIdsRef.current = new Set(data.map((t) => t.id));
        setTags(data);
      })
      .catch((err) => {
        console.error("Failed to fetch tags:", err);
      });
  }, [selectedCanvasId]);

  // ── Placement mode handlers ────────────────────────────────────────────

  const handleAddNodeAtPosition = useCallback((cx: number, cy: number) => {
    setPlacementMode({ type: 'node', startX: cx, startY: cy });
    setContextMenu(null);
  }, []);

  const placeNodeAtCursor = useCallback((cx: number, cy: number) => {
    if (!selectedCanvasId || !placementMode) return;

    const defaultWidth = 200;
    const defaultHeight = 60;

    const defaultContent = "New node";

    safeInvoke<CanvasNode>("create_canvas_node", {
      canvasId: selectedCanvasId,
      content: defaultContent,
      x: cx - defaultWidth / 2,
      y: cy - defaultHeight / 2,
      width: defaultWidth,
      height: defaultHeight,
      metadataJson: null,
    }).then((newNode) => {
      setNodes((prev) => [...prev, newNode]);
      // Push undo command
      pushUndo({ type: "create_node", node: newNode });
      // Enter edit mode on the new node
      setEditingNodeId(newNode.id);
      setEditingValue(newNode.content);
      // Select the new node
      setSelectedNodeIds(new Set([newNode.id]));
      // Clear placement mode
      setPlacementMode(null);
      setCursorCanvasPos(null);
    }).catch((err) => {
      console.error("Failed to create node:", err);
      showToast("Failed to create node");
      setPlacementMode(null);
      setCursorCanvasPos(null);
    });
  }, [selectedCanvasId, placementMode, pushUndo, showToast, setNodes, setSelectedNodeIds, setEditingNodeId, setEditingValue]);

  const placeGroupAtCursor = useCallback((_cx: number, _cy: number) => {
    if (!selectedCanvasId || !placementMode || placementMode.type !== 'group') return;
    if (selectedNodeIds.size === 0) {
      showToast("Select nodes first to create a group");
      setPlacementMode(null);
      setCursorCanvasPos(null);
      return;
    }

    const groupNodeIds = [...selectedNodeIds];
    safeInvoke<CanvasGroup>("create_canvas_group", {
      canvasId: selectedCanvasId,
      label: "Group",
      nodeIdsJson: JSON.stringify(groupNodeIds),
      metadataJson: null,
    }).then((newGroup) => {
      setGroups((prev) => [...prev, newGroup]);
      showToast("Group created");
      setPlacementMode(null);
      setCursorCanvasPos(null);
    }).catch((err) => {
      console.error("Failed to create group:", err);
      showToast("Failed to create group");
      setPlacementMode(null);
      setCursorCanvasPos(null);
    });
  }, [selectedCanvasId, placementMode, selectedNodeIds, showToast]);

  // Calculate ghost size based on selected nodes
  const getGroupGhostSize = useCallback(() => {
    if (selectedNodeIds.size === 0) return { width: 300, height: 200 };

    const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
    const padding = 20;
    const minX = Math.min(...selectedNodes.map(n => n.x));
    const minY = Math.min(...selectedNodes.map(n => n.y));
    const maxX = Math.max(...selectedNodes.map(n => n.x + n.width));
    const maxY = Math.max(...selectedNodes.map(n => n.y + n.height));

    return { width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  }, [selectedNodeIds, nodes]);

  // Handle click on empty canvas to deselect and clear edit
  const handleCanvasClick = useCallback((canvasX: number, canvasY: number, _e: React.MouseEvent) => {
    // Don't clear selection if we just completed a box-select
    if (justCompletedBoxSelectRef.current) return;

    // If in placement mode, place the element at the click position
    if (placementMode) {
      if (placementMode.type === 'node') {
        placeNodeAtCursor(canvasX, canvasY);
      } else if (placementMode.type === 'group') {
        placeGroupAtCursor(canvasX, canvasY);
      }
      return;
    }

    setSelectedNodeIds(new Set());
    setEditingNodeId(null);
    setEditingValue("");
    // Close context menu on any click
    setContextMenu(null);
  }, [placementMode, placeNodeAtCursor, placeGroupAtCursor, justCompletedBoxSelectRef, setSelectedNodeIds, setEditingNodeId, setEditingValue]);

  // Add a group at a specific canvas position (enters placement mode)
  const handleAddGroupAtPosition = useCallback((cx: number, cy: number) => {
    if (selectedNodeIds.size === 0) {
      showToast("Select nodes first to create a group");
      return;
    }
    setPlacementMode({ type: 'group', startX: cx, startY: cy });
    setContextMenu(null);
  }, [selectedNodeIds, showToast]);

  // ── Context menu handlers ──────────────────────────────────────────────

  // Context menu items for the empty canvas
  const canvasMenuItems: ContextMenuItem[] = [
    { label: "Add Node", shortcut: "N", onClick: () => handleAddNodeAtPosition(contextMenu!.canvasX, contextMenu!.canvasY) },
    { label: "", separator: true, onClick: () => {} },
    { label: "Add Group", shortcut: "G", onClick: () => handleAddGroupAtPosition(contextMenu!.canvasX, contextMenu!.canvasY) },
  ];

  // Handle "Edit" from context menu — enters inline edit mode
  const handleEditNode = useCallback((nodeId: string | undefined) => {
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setEditingNodeId(node.id);
    setEditingValue(node.content);
    setSelectedNodeIds(new Set());
  }, [nodes, setEditingNodeId, setEditingValue, setSelectedNodeIds]);

  // Handle "Delete" from context menu — deletes the node
  const handleDeleteNode = useCallback(async (nodeId: string | undefined) => {
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Start fade-out animation
    setDeletingNodeIds((prev) => new Set(prev).add(nodeId));
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });

    try {
      await safeInvoke("delete_canvas_node", { id: node.id });
      pushUndo({ type: "delete_node", node });
    } catch (err) {
      console.error("Failed to delete node:", err);
    }

    // Remove from deleting set after animation completes
    setTimeout(() => {
      setDeletingNodeIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }, 260);
    setContextMenu(null);
  }, [nodes, pushUndo, setSelectedNodeIds]);

  // Context menu items for a node
  const nodeMenuItems: ContextMenuItem[] = [
    { label: "Edit", shortcut: "Enter", onClick: () => handleEditNode(contextMenu?.nodeId) },
    { label: "", separator: true, onClick: () => {} },
    { label: "Add to Group", disabled: true, onClick: () => {} },
    { label: "Add Tag", disabled: true, onClick: () => {} },
    { label: "", separator: true, onClick: () => {} },
    { label: "Delete", shortcut: "Del", onClick: () => handleDeleteNode(contextMenu?.nodeId) },
  ];

  // Handle "Edit Label" from edge context menu
  const handleEditEdgeLabel = useCallback((edgeId: string | undefined) => {
    if (!edgeId) return;
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const currentLabel = edge.label ?? "";
    const newLabel = prompt("Edit edge label:", currentLabel);
    if (newLabel === null) return;
    const trimmed = newLabel.trim();
    if (trimmed === currentLabel) return;

    safeInvoke<CanvasEdge>("update_canvas_edge", {
      id: edgeId,
      label: trimmed.length > 0 ? trimmed : null,
      metadataJson: null,
    }).then((updatedEdge) => {
      setEdges((prev) => prev.map((e) => (e.id === edgeId ? updatedEdge : e)));
      showToast(trimmed.length > 0 ? `Label updated to "${trimmed}"` : "Label removed");
    }).catch((err) => {
      console.error("Failed to update edge label:", err);
      showToast("Failed to update edge label");
    });
    setContextMenu(null);
  }, [edges, showToast]);

  // Handle "Delete" from edge context menu
  const handleDeleteEdge = useCallback(async (edgeId: string | undefined) => {
    if (!edgeId) return;
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;

    try {
      await safeInvoke("delete_canvas_edge", { id: edgeId });
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));
      showToast("Edge deleted");
    } catch (err) {
      console.error("Failed to delete edge:", err);
      showToast("Failed to delete edge");
    }
    setContextMenu(null);
  }, [edges, showToast]);

  // Context menu items for an edge
  const edgeMenuItems: ContextMenuItem[] = [
    { label: "Edit Label", onClick: () => handleEditEdgeLabel(contextMenu?.edgeId) },
    { label: "", separator: true, onClick: () => {} },
    { label: "Delete", shortcut: "Del", onClick: () => handleDeleteEdge(contextMenu?.edgeId) },
  ];

  // Handle "Rename" from group context menu
  const handleRenameGroup = useCallback((groupId: string | undefined) => {
    if (!groupId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const currentLabel = group.label;
    const newLabel = prompt("Rename group:", currentLabel);
    if (newLabel === null) return;
    const trimmed = newLabel.trim();
    if (trimmed.length === 0) return;
    if (trimmed === currentLabel) return;

    safeInvoke<CanvasGroup>("update_canvas_group", {
      id: groupId,
      label: trimmed,
      nodeIdsJson: null,
      metadataJson: null,
    }).then((updatedGroup) => {
      setGroups((prev) => prev.map((g) => (g.id === groupId ? updatedGroup : g)));
      showToast(`Group renamed to "${trimmed}"`);
    }).catch((err) => {
      console.error("Failed to rename group:", err);
      showToast("Failed to rename group");
    });
    setContextMenu(null);
  }, [groups, showToast]);

  // Handle "Dissolve" from group context menu — removes group, keeps nodes
  const handleDissolveGroup = useCallback((groupId: string | undefined) => {
    if (!groupId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    safeInvoke("delete_canvas_group", { id: groupId }).then(() => {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      showToast("Group dissolved");
    }).catch((err) => {
      console.error("Failed to dissolve group:", err);
      showToast("Failed to dissolve group");
    });
    setContextMenu(null);
  }, [groups, showToast]);

  // Handle "Delete" from group context menu — same as dissolve (safe default)
  const handleDeleteGroup = useCallback((groupId: string | undefined) => {
    handleDissolveGroup(groupId);
  }, [handleDissolveGroup]);

  // Context menu items for a group
  const groupMenuItems: ContextMenuItem[] = [
    { label: "Rename", onClick: () => handleRenameGroup(contextMenu?.groupId) },
    { label: "", separator: true, onClick: () => {} },
    { label: "Dissolve", onClick: () => handleDissolveGroup(contextMenu?.groupId) },
    { label: "Delete", onClick: () => handleDeleteGroup(contextMenu?.groupId) },
  ];

  // ── Keyboard effect ────────────────────────────────────────────────────

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
        // Cancel active connection drag
        if (connectionDragRef.current) {
          endConnectionDrag(0, 0);
          return;
        }
        // Cancel placement mode if active
        if (placementMode) {
          setPlacementMode(null);
          setCursorCanvasPos(null);
          return;
        }
        setSelectedNodeIds(new Set());
        setEditingNodeId(null);
        setEditingValue("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteSelectedNodes, handleUndo, handleRedo, placementMode, setSelectedNodeIds, setEditingNodeId, setEditingValue]);

  // ── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        canvasListRef.current?.contains(document.activeElement) &&
        document.activeElement !== canvasFilterInputRef.current
      ) {
        e.preventDefault();
        e.stopPropagation();
        canvasFilterInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onGlobalKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onGlobalKeyDown, { capture: true });
  }, []);

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
      if (boxSelect) {
        handleBoxSelectEnd();
      }
      handleDragEnd();
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
  }, [boxSelect, handleBoxSelectEnd, handleDragEnd]);

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

  useTauriEvent(
    "db-changed",
    useCallback(() => {
      fetchCanvases();
      fetchNodes();
      fetchEdges();
      fetchGroups();
      fetchTags();
    }, [fetchCanvases, fetchNodes, fetchEdges, fetchGroups, fetchTags]),
  );

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading && canvases.length === 0) {
    return (
      <div className="canvas-loading">
        Loading canvases...
      </div>
    );
  }

  if (error) {
    return (
      <div className="canvas-error">
        {error}
      </div>
    );
  }

  const filteredCanvases = canvasFilterQuery
    ? canvases.filter((c) => c.name.toLowerCase().includes(canvasFilterQuery.toLowerCase()))
    : canvases;

  // If no canvas is selected, show the canvas list
  if (!selectedCanvasId) {
    if (canvases.length === 0) {
      return (
        <div
          tabIndex={0}
          className="canvas-empty-state"
          onKeyDown={(e) => {
            if (e.key === "n" || e.key === "N") {
              e.preventDefault();
              setCanvasModalOpen({ mode: "create" });
            }
          }}
        >
          <div className="canvas-empty-state__icon">&#9633;</div>
          <div>
            <div className="canvas-empty-state__title">No canvases yet</div>
            <div className="canvas-empty-state__desc">
              Create one to organize your ideas visually
            </div>
          </div>
          <Button variant="primary" size="md" onClick={() => setCanvasModalOpen({ mode: "create" })}>
            <Plus size={14} /> New canvas <kbd className="canvas-empty-state__kbd">n</kbd>
          </Button>
          {sessionId && (
            <CanvasModal
              open={canvasModalOpen !== null}
              onClose={() => setCanvasModalOpen(null)}
              sessionId={sessionId}
              canvas={canvasModalOpen?.mode === "rename" ? canvasModalOpen.canvas : undefined}
            />
          )}
        </div>
      );
    }

    return (
      <div
        ref={canvasListRef}
        tabIndex={0}
        className="canvas-list"
        onKeyDown={(e) => {
          if (e.key === "n" || e.key === "N") {
            e.preventDefault();
            setCanvasModalOpen({ mode: "create" });
          }
        }}
      >
        <div className="canvas-list__toolbar">
          <div className="canvas-list__search-wrap">
            <SearchBar
              ref={canvasFilterInputRef}
              value={canvasFilterQuery}
              onChange={setCanvasFilterQuery}
              placeholder="Filter canvases… (press /)"
              trailing={
                canvasFilterQuery ? (
                  <>
                    <span className="canvas-filter-count">
                      {filteredCanvases.length}/{canvases.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCanvasFilterQuery("")}
                      aria-label="Clear filter"
                    >
                      <X size={12} />
                    </Button>
                  </>
                ) : null
              }
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCanvasModalOpen({ mode: "create" })}
            title="New canvas (n)"
          >
            <Plus size={14} />
          </Button>
        </div>
        {filteredCanvases.length === 0 ? (
          <div className="canvas-list__empty">
            {canvasFilterQuery ? "No matching canvases" : "No canvases yet"}
          </div>
        ) : (
        <AnimatePresence mode="popLayout">
          {filteredCanvases.map((canvas, idx) => (
            <motion.div
              key={canvas.id}
              layout
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.2,
                delay: idx * 0.03,
                ease: [0.2, 0, 0, 1],
              }}
              className="canvas-card"
              onClick={() => setSelectedCanvasId(canvas.id)}
            >
              <div className="canvas-card__title">
                {canvas.name}
              </div>
              <div className="canvas-card__date">
                Created {new Date(canvas.created_at).toLocaleDateString()}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        )}

        {sessionId && (
          <CanvasModal
            open={canvasModalOpen !== null}
            onClose={() => setCanvasModalOpen(null)}
            sessionId={sessionId}
            canvas={canvasModalOpen?.mode === "rename" ? canvasModalOpen.canvas : undefined}
          />
        )}
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
    <div className="visual-canvas-panel">


      {/* Header with back button */}
      <div className="canvas-header">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedCanvasId(null)}
        >
          &larr;
        </Button>
        <div className="canvas-header__title">
          {selectedCanvas?.name || "Canvas"}
        </div>
        {/* Zoom indicator and reset */}
        <div className="canvas-header__zoom">
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="sm"
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
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Tag filter bar */}
      {uniqueTags.length > 0 && (
        <div className="canvas-tag-bar">
          <span className="canvas-tag-bar__label">
            Filter:
          </span>
          <Button
            variant={!activeTagFilter ? "primary" : "ghost"}
            size="sm"
            onClick={() => setActiveTagFilter(null)}
          >
            All
          </Button>
          {uniqueTags.map(tag => (
            <Button
              key={tag}
              variant={activeTagFilter === tag ? "primary" : "ghost"}
              size="sm"
              onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <CanvasRenderer
        nodes={filteredNodes}
        edges={filteredEdges}
        groups={groups}
        mode="editable"
        offsetX={offsetX}
        offsetY={offsetY}
        zoom={zoom}
        onOffsetChange={(x, y) => {
          setOffsetX(x);
          setOffsetY(y);
          saveViewState(x, y, zoom);
        }}
        onZoomChange={(z) => {
          setZoom(z);
          saveViewState(offsetX, offsetY, z);
        }}
        onNodeClick={handleNodeClick}
        onNodeMouseDown={handleNodeMouseDown}
        onNodeDoubleClick={(nodeId, e) => {
          e.stopPropagation();
          e.preventDefault();
          handleNodeDoubleClick(nodeId);
        }}
        onNodeHover={setHoveredNodeId}
        onNodeContextMenu={(nodeId, x, y) => setContextMenu({ x, y, canvasX: 0, canvasY: 0, nodeId })}
        onEdgeClick={() => {}}
        onEdgeContextMenu={(edgeId, x, y) => setContextMenu({ x, y, canvasX: 0, canvasY: 0, edgeId })}
        onGroupContextMenu={(groupId, x, y) => setContextMenu({ x, y, canvasX: 0, canvasY: 0, groupId })}
        onCanvasClick={handleCanvasClick}
        onCanvasMouseMove={handleCanvasMouseMove}
        onCanvasMouseUp={handleMouseUp}
        onCanvasContextMenu={(canvasX, canvasY, screenX, screenY) => setContextMenu({ x: screenX, y: screenY, canvasX, canvasY })}
        selectedNodeIds={selectedNodeIds}
        deletingNodeIds={deletingNodeIds}
        tags={tags}
        renderTags={(nodeId) => {
          const nodeTags = tags.filter(t => t.node_id === nodeId);
          if (nodeTags.length === 0) return null;
          const node = filteredNodes.find(n => n.id === nodeId);
          if (!node) return null;
          return (
            <foreignObject
              x={node.x + 8}
              y={node.y + node.height - 22}
              width={node.width - 16}
              height={18}
            >
              <div className="canvas-tags-row">
                {nodeTags.slice(0, 3).map((t) => {
                  const isNew = newlyAddedTagIds.has(t.id);
                  if (isNew) {
                    return (
                      <motion.span
                        key={t.id}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <Badge size="sm" variant="default">{t.tag}</Badge>
                      </motion.span>
                    );
                  }
                  return <Badge key={t.id} size="sm" variant="default">{t.tag}</Badge>;
                })}
                {nodeTags.length > 3 && (
                  <span className="canvas-tag-overflow">
                    +{nodeTags.length - 3}
                  </span>
                )}
              </div>
            </foreignObject>
          );
          }}
        hoveredNodeId={hoveredNodeId}
        draggedNodeId={draggedNodeId}
        editingNodeId={editingNodeId}
        editingValue={editingValue}
        onEditingValueChange={setEditingValue}
        onEditKeyDown={handleEditKeyDown}
        onEditBlur={confirmEdit}
        editInputRef={editInputRef}
        boxSelect={boxSelect}
        onHandleMouseDown={(nodeId, side) => startConnectionDrag(nodeId, side)}
        connectionDragActive={!!connectionDrag}
        ropePoints={ropePoints}
        dragOverNodeId={dragOverNodeId}
        onArrowheadGrab={(edgeId, endX, endY) => startRewire(edgeId, endX, endY)}
        rewireRopePoints={rewireRopePoints}
        rewireDragOverNodeId={rewireDragOverNodeId}
        rewireActive={!!rewire}
        snappedMidpoint={snappedMidpoint}
        rewireSnappedMidpoint={rewireSnappedMidpoint}
      >
        {/* Ghost preview for node placement */}
        {placementMode && placementMode.type === 'node' && cursorCanvasPos && (
          <g transform={`translate(${cursorCanvasPos.x - 100}, ${cursorCanvasPos.y - 30})`} className="node-ghost">
            <rect
              width={200}
              height={60}
              rx={10}
              ry={10}
              fill="var(--canvas-node-bg)"
              fillOpacity={0.5}
              stroke="var(--canvas-accent)"
              strokeWidth={2}
              strokeDasharray="6 3"
            />
            <text
              x={100}
              y={35}
              textAnchor="middle"
              fill="var(--canvas-accent-bright)"
              fillOpacity={0.7}
              fontSize={14}
            >
              Click to place
            </text>
          </g>
        )}
        {/* Ghost preview for group placement */}
        {placementMode && placementMode.type === 'group' && cursorCanvasPos && (
          <g transform={`translate(${cursorCanvasPos.x - getGroupGhostSize().width / 2}, ${cursorCanvasPos.y - getGroupGhostSize().height / 2})`} className="node-ghost">
            <rect
              width={getGroupGhostSize().width}
              height={getGroupGhostSize().height}
              rx={12}
              ry={12}
              fill="var(--canvas-accent)"
              fillOpacity={0.1}
              stroke="var(--canvas-accent)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
            <text
              x={getGroupGhostSize().width / 2}
              y={getGroupGhostSize().height / 2 + 5}
              textAnchor="middle"
              fill="var(--canvas-accent-bright)"
              fillOpacity={0.7}
              fontSize={14}
            >
              Click to place group
            </text>
          </g>
        )}
      </CanvasRenderer>

      {/* Selection count indicator */}
      {selectedNodeIds.size > 1 && (
        <div className="canvas-selection-count">
          {selectedNodeIds.size} selected
        </div>
      )}

      {/* Undo/Redo badge */}
      {(undoStack.length > 0 || redoStack.length > 0) && (
        <div className="canvas-undo-bar">
          <Button
            as={motion.button as React.ElementType}
            className="canvas-undo-btn"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            {...({
              initial: false,
              animate: { scale: 1, opacity: 1 },
              transition: { type: "spring", stiffness: 400, damping: 25 },
            } as Record<string, unknown>)}
          >
            <span className="canvas-undo-btn__icon">&#8630;</span>
            <span className="canvas-undo-btn__count">{undoStack.length}</span>
          </Button>
          <Button
            as={motion.button as React.ElementType}
            className="canvas-undo-btn"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            {...({
              initial: false,
              animate: { scale: 1, opacity: 1 },
              transition: { type: "spring", stiffness: 400, damping: 25 },
            } as Record<string, unknown>)}
          >
            <span className="canvas-undo-btn__icon">&#8631;</span>
            <span className="canvas-undo-btn__count">{redoStack.length}</span>
          </Button>
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
            className="canvas-toast"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context menu (right-click on empty canvas, node, edge, or group) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.nodeId ? nodeMenuItems : contextMenu.edgeId ? edgeMenuItems : contextMenu.groupId ? groupMenuItems : canvasMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

registerPanel("visual-canvas", "Visual Canvas", VisualCanvasPanel);

export default VisualCanvasPanel;
