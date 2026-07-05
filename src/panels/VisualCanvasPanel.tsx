import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelContext } from "../PanelContext";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { safeInvoke } from "../safeInvoke";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";
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
  useCanvasEdgeCreation,
  useCanvasInlineEdit,
  useCanvasNodeDrag,
} from "../hooks/canvas";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shockwave effect: track newly created node IDs
  const [newlyCreatedNodeIds, setNewlyCreatedNodeIds] = useState<Set<string>>(new Set());
  const prevNodeIdsRef = useRef<Set<string>>(new Set());

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
    setNewlyCreatedNodeIds,
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

  // Edge creation
  const {
    edgeDragState, setEdgeDragState,
    isAltPressed, hoveredNodeId, setHoveredNodeId,
    handleEdgeDragStart,
    handleEdgeDragMove,
    handleEdgeDragEnd,
  } = useCanvasEdgeCreation({
    nodes, selectedCanvasId, showToast, setEdges,
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

  // ── Node drag with edge creation routing ────────────────────────────────

  // Handle node mouse down — route to edge creation (Alt) or drag
  const handleNodeMouseDown = useCallback((
    nodeId: string,
    e: React.MouseEvent
  ) => {
    if (e.altKey) {
      // Start edge creation instead of drag
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      e.stopPropagation();
      e.preventDefault();
      const sourceX = node.x + node.width / 2;
      const sourceY = node.y + node.height / 2;
      handleEdgeDragStart(nodeId, sourceX, sourceY);
      return;
    }
    dragHandleNodeMouseDown(nodeId, e);
  }, [nodes, handleEdgeDragStart, dragHandleNodeMouseDown]);

  // Handle mouse move on canvas (dispatcher)
  const handleCanvasMouseMove = useCallback((canvasX: number, canvasY: number, viewportX: number, viewportY: number, e: React.MouseEvent) => {
    // Handle placement mode (ghost preview)
    if (placementMode) {
      setCursorCanvasPos({ x: canvasX, y: canvasY });
      return;
    }

    // Handle box-select rubber band
    if (boxSelect) {
      handleBoxSelectMove(viewportX, viewportY);
      return;
    }

    // Handle edge drag
    if (edgeDragState) {
      handleEdgeDragMove(canvasX, canvasY);
      return;
    }

    if (!dragState) return;
    handleDragMove(e.clientX, e.clientY);
  }, [dragState, handleDragMove, boxSelect, handleBoxSelectMove, edgeDragState, handleEdgeDragMove, placementMode]);

  // Handle mouse up to end dragging
  const handleMouseUp = useCallback((canvasX: number, canvasY: number, _e: React.MouseEvent) => {
    // Complete edge drag if active
    if (edgeDragState) {
      handleEdgeDragEnd(canvasX, canvasY);
      return;
    }

    // Complete box-select if active
    if (boxSelect) {
      handleBoxSelectEnd();
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
  }, [dragState, nodes, pushUndo, boxSelect, handleBoxSelectEnd, edgeDragState, handleEdgeDragEnd, handleDragEnd]);

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
      // Trigger shockwave
      setNewlyCreatedNodeIds((prev) => new Set(prev).add(newNode.id));
      setTimeout(() => {
        setNewlyCreatedNodeIds((prev) => {
          const next = new Set(prev);
          next.delete(newNode.id);
          return next;
        });
      }, 1400);
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

  // Handle "Add Edge" from context menu — starts edge creation from this node
  const handleStartEdgeFromNode = useCallback((nodeId: string | undefined) => {
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const sourceX = node.x + node.width / 2;
    const sourceY = node.y + node.height / 2;
    setEdgeDragState({
      sourceNodeId: node.id,
      sourceX,
      sourceY,
      targetX: sourceX,
      targetY: sourceY,
    });
    setContextMenu(null);
  }, [nodes, setEdgeDragState]);

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
    { label: "Add Edge", shortcut: "Alt+Click", onClick: () => handleStartEdgeFromNode(contextMenu?.nodeId) },
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
        // Cancel placement mode if active
        if (placementMode) {
          setPlacementMode(null);
          setCursorCanvasPos(null);
          return;
        }
        // Cancel edge drag if active
        if (edgeDragState) {
          setEdgeDragState(null);
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
  }, [deleteSelectedNodes, handleUndo, handleRedo, edgeDragState, placementMode, setSelectedNodeIds, setEditingNodeId, setEditingValue, setEdgeDragState]);

  // ── Effects ────────────────────────────────────────────────────────────

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
      setEdgeDragState(null);
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
  }, [boxSelect, handleBoxSelectEnd, setEdgeDragState, handleDragEnd]);

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
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
        Loading canvases...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: "var(--danger)", fontSize: 13 }}>
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
          color: "var(--text-muted)",
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
              initial={false}
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
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
              }}
              onClick={() => setSelectedCanvasId(canvas.id)}
            >
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {canvas.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
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

          /* Colors are now provided by the theme system via applyTheme().
             Canvas-specific tokens (--canvas-*) are set in the theme files. */

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

        .node-ghost {
          animation: ghost-pulse 1.5s ease-in-out infinite;
        }

        @keyframes ghost-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.7; }
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
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <button
          onClick={() => setSelectedCanvasId(null)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
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
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-muted)",
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
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 4 }}>
            Filter:
          </span>
          <button
            onClick={() => setActiveTagFilter(null)}
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: !activeTagFilter ? "var(--canvas-accent)" : "transparent",
              color: !activeTagFilter ? "#fff" : "var(--text-muted)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            All
          </button>
          {uniqueTags.map(tag => (
            <motion.button
              key={tag}
              initial={false}
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
                border: "1px solid var(--border)",
                background: activeTagFilter === tag ? "var(--canvas-accent)" : "transparent",
                color: activeTagFilter === tag ? "#fff" : "var(--text-muted)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {tag}
            </motion.button>
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
        edgeDragSource={edgeDragState ? { nodeId: edgeDragState.sourceNodeId, x: edgeDragState.sourceX, y: edgeDragState.sourceY } : null}
        edgeDragTarget={edgeDragState ? { x: edgeDragState.targetX, y: edgeDragState.targetY } : null}
        newNodeIds={newlyCreatedNodeIds}
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
                    color: "var(--text-muted)",
                    alignSelf: "center",
                  }}>
                    +{nodeTags.length - 3}
                  </span>
                )}
              </div>
            </foreignObject>
          );
        }}
        renderNodeOverlay={(node) => {
          if (!newlyCreatedNodeIds.has(node.id)) return null;
          return (
            <foreignObject
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              style={{ overflow: "visible", pointerEvents: "none" }}
            >
              <div className="node-shockwave" />
            </foreignObject>
          );
        }}
        hoveredNodeId={hoveredNodeId}
        isAltPressed={isAltPressed}
        draggedNodeId={draggedNodeId}
        editingNodeId={editingNodeId}
        editingValue={editingValue}
        onEditingValueChange={setEditingValue}
        onEditKeyDown={handleEditKeyDown}
        onEditBlur={confirmEdit}
        editInputRef={editInputRef}
        boxSelect={boxSelect}
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
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: undoStack.length > 0 ? "var(--bg-secondary)" : "var(--bg-primary)",
              color: undoStack.length > 0 ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 11,
              cursor: undoStack.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>&#8630;</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{undoStack.length}</span>
          </motion.button>
          <motion.button
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: redoStack.length > 0 ? "var(--bg-secondary)" : "var(--bg-primary)",
              color: redoStack.length > 0 ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 11,
              cursor: redoStack.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>&#8631;</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{redoStack.length}</span>
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
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
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
