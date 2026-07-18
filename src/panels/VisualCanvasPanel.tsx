import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type OnConnectStart,
  type OnConnectEnd,
  type Connection,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelContext } from "../PanelContext";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { safeInvoke } from "../safeInvoke";
import { Button, ListCard, FilterableList, Input } from "../components/ui";
import { Dialog } from "../components/Dialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Plus } from "lucide-react";
import CanvasModal from "../CanvasModal";
import CanvasNodeComponent from "./CanvasNodeComponent";
import CanvasGroupNodeComponent from "./CanvasGroupNodeComponent";
import CanvasConnectionLine from "./CanvasConnectionLine";
import CanvasEdge from "./CanvasEdge";
import NodeEditModal from "./NodeEditModal";
import EdgeEditModal from "./EdgeEditModal";
import { useCanvasToast } from "../hooks/canvas/useCanvasToast";
import { useCanvasUndo } from "../hooks/canvas/useCanvasUndo";
import {
  useCanvasSync,
  backendNodeToXYFlowNode,
  backendEdgeToXYFlowEdge,
  type CanvasNode,
  type CanvasTag,
  type CanvasEdge as BackendCanvasEdge,
} from "../hooks/canvas/useCanvasSync";
import "./VisualCanvasPanel.css";

interface VisualCanvas {
  id: string;
  session_id: string;
  name: string;
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

function VisualCanvasPanelInner({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelContext();
  const [canvases, setCanvases] = useState<VisualCanvas[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [tags, setTags] = useState<CanvasTag[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [canvasModalOpen, setCanvasModalOpen] = useState<{ mode: "create" } | { mode: "rename"; canvas: VisualCanvas } | null>(null);
  const [canvasFilterQuery, setCanvasFilterQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedCanvasIndex, setFocusedCanvasIndex] = useState<number | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [viewportLoaded, setViewportLoaded] = useState(false);

  // Track known tag IDs for change detection
  const prevTagIdsRef = useRef<Set<string>>(new Set());

  // Node modal state
  const [nodeModalOpen, setNodeModalOpen] = useState(false);
  const [nodeModalNodeId, setNodeModalNodeId] = useState<string | null>(null);

  // Edge modal state
  const [edgeModalOpen, setEdgeModalOpen] = useState(false);
  const [edgeModalEdgeId, setEdgeModalEdgeId] = useState<string | null>(null);

  // Group rename state
  const [groupRenameId, setGroupRenameId] = useState<string | null>(null);
  const [groupRenameValue, setGroupRenameValue] = useState("");

  // ── Delete confirmation state ──────────────────────────────────────────
  const [selectedNodeCount, setSelectedNodeCount] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmItems, setDeleteConfirmItems] = useState<string[]>([]);
  const [deleteConfirmEntityType, setDeleteConfirmEntityType] = useState<"nodes" | "edges" | "groups" | "mixed">("nodes");

  // ── Undo / Redo ────────────────────────────────────────────────────────
  const { captureState, pushUndo, undo, redo, canUndo, canRedo, clear } = useCanvasUndo();
  const reactFlowInstance = useReactFlow();
  const dragStartStateRef = useRef<ReturnType<typeof captureState> | null>(null);

  // Clear undo stack when canvas changes
  useEffect(() => {
    if (selectedCanvasId) clear();
  }, [selectedCanvasId]);

  // ── Viewport persistence ───────────────────────────────────────────────

  // Reset viewport loaded flag when canvas changes
  useEffect(() => {
    setViewportLoaded(false);
  }, [selectedCanvasId]);

  // Restore viewport on mount
  useEffect(() => {
    if (!selectedCanvasId || viewportLoaded) return;
    (async () => {
      try {
        const vs = await safeInvoke<any>("get_canvas_view_state", { canvasId: selectedCanvasId });
        if (vs && typeof vs.offset_x === "number") {
          reactFlowInstance.setViewport({ x: vs.offset_x, y: vs.offset_y, zoom: vs.zoom });
        }
      } catch (e) { /* no saved viewport */ }
      setViewportLoaded(true);
    })();
  }, [selectedCanvasId, viewportLoaded, reactFlowInstance]);

  // ── Hooks ──────────────────────────────────────────────────────────────

  // Toast
  const { toast } = useCanvasToast();

  // xyflow state
  const [xyflowNodes, setXYFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [xyflowEdges, setXYFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [xyflowGroups, setXYFlowGroups] = useState<Node[]>([]);

  // Sync hook — provides persistNodePosition and pendingNodeIds
  const { persistNodePosition } = useCanvasSync({
    canvasId: selectedCanvasId,
    sessionId,
    setNodes: setXYFlowNodes,
    setEdges: setXYFlowEdges,
  });

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchCanvases = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    safeInvoke<VisualCanvas[]>("list_visual_canvases", { sessionId })
      .then((data) => {
        setCanvases(data);
        setLoading(false);
        setError(null);
        if (isFirstLoad) {
          setIsFirstLoad(false);
        }
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [sessionId, isFirstLoad]);

  const fetchNodes = useCallback(() => {
    if (!selectedCanvasId) {
      setXYFlowNodes([]);
      return;
    }
    Promise.all([
      safeInvoke<CanvasNode[]>("list_canvas_nodes", { canvasId: selectedCanvasId }),
      safeInvoke<CanvasTag[]>("list_canvas_tags_by_canvas", { canvasId: selectedCanvasId }),
      safeInvoke<{ id: string; node_id: string; url: string; source_type: string }[]>("list_canvas_node_sources", { nodeId: "__all__" }).catch(() => []),
    ])
      .then(([backendNodes, backendTags, backendSources]) => {
        const tagsByNode = new Map<string, string[]>();
        for (const t of backendTags) {
          if (!tagsByNode.has(t.node_id)) tagsByNode.set(t.node_id, []);
          tagsByNode.get(t.node_id)!.push(t.tag);
        }
        const sourcesByNode = new Map<string, { id: string; url: string; source_type: string }[]>();
        for (const s of backendSources) {
          if (!sourcesByNode.has(s.node_id)) sourcesByNode.set(s.node_id, []);
          sourcesByNode.get(s.node_id)!.push({ id: s.id, url: s.url, source_type: s.source_type });
        }
        setXYFlowNodes(
          backendNodes.map((n) => {
            const base = backendNodeToXYFlowNode(n);
            return {
              ...base,
              data: {
                ...base.data,
                tags: tagsByNode.get(n.id) || [],
                sources: sourcesByNode.get(n.id) || [],
              },
            };
          })
        );
      })
      .catch((err) => {
        console.error("Failed to fetch nodes:", err);
      });
  }, [selectedCanvasId]);

  const fetchEdges = useCallback(() => {
    if (!selectedCanvasId) {
      setXYFlowEdges([]);
      return;
    }
    safeInvoke<BackendCanvasEdge[]>("list_canvas_edges", { canvasId: selectedCanvasId })
      .then((data) => {
        setXYFlowEdges(data.map(backendEdgeToXYFlowEdge));
      })
      .catch((err) => {
        console.error("Failed to fetch edges:", err);
      });
  }, [selectedCanvasId]);

  const fetchGroups = useCallback(() => {
    if (!selectedCanvasId) {
      setXYFlowGroups([]);
      return;
    }
    safeInvoke<CanvasGroup[]>("list_canvas_groups", { canvasId: selectedCanvasId })
      .then((backendGroups) => {
        const groupNodes: Node[] = backendGroups.map((g) => {
          const memberIds: string[] = JSON.parse(g.node_ids_json || "[]");
          return {
            id: g.id,
            type: "canvasGroup",
            position: { x: 0, y: 0 },
            data: { label: g.label, memberIds, node_ids_json: g.node_ids_json },
            draggable: false,
            selectable: true,
            style: { zIndex: -1 },
          };
        });
        setXYFlowGroups(groupNodes);
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
        prevTagIdsRef.current = new Set(data.map((t) => t.id));
        setTags(data);
      })
      .catch((err) => {
        console.error("Failed to fetch tags:", err);
      });
  }, [selectedCanvasId]);

  // ── Selection change handler ────────────────────────────────────────────

  const onSelectionChange = useCallback(({ nodes }: OnSelectionChangeParams) => {
    // Filter out group nodes from count
    const realNodes = nodes.filter((n) => n.type !== "canvasGroup");
    setSelectedNodeCount(realNodes.length);
  }, []);

  // ── Connection handlers ────────────────────────────────────────────────

  const handleConnectStart: OnConnectStart = useCallback((_event, params) => {
    const { nodeId } = params;
    if (!nodeId) return;
    setXYFlowNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isConnectSource: true } } : n
      )
    );
  }, [setXYFlowNodes]);

  const handleConnectEnd: OnConnectEnd = useCallback(() => {
    setXYFlowNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, isConnectSource: false, isConnectTarget: false },
      }))
    );
  }, [setXYFlowNodes]);

  const onConnect: OnConnect = useCallback(async (connection: Connection) => {
    if (!selectedCanvasId || !connection.source || !connection.target) return;

    // Capture state before creating edge for undo
    const preConnectState = captureState(xyflowNodes, xyflowEdges, xyflowGroups);

    try {
      const sourceHandle = connection.sourceHandle || "right";
      const targetHandle = connection.targetHandle || "left";
      const edge = await safeInvoke<BackendCanvasEdge>("create_canvas_edge", {
        canvasId: selectedCanvasId,
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        metadataJson: JSON.stringify({ sourceSide: sourceHandle, targetSide: targetHandle }),
      });
      pushUndo(preConnectState);
      setXYFlowEdges((eds) => [...eds, backendEdgeToXYFlowEdge(edge)]);
      setXYFlowNodes((nds) =>
        nds.map((n) =>
          n.id === connection.target ? { ...n, data: { ...n.data, isConnected: true } } : n
        )
      );
      setTimeout(() => {
        setXYFlowNodes((nds) =>
          nds.map((n) =>
            n.id === connection.target ? { ...n, data: { ...n.data, isConnected: false } } : n
          )
        );
      }, 600);
    } catch (err) {
      console.error("Failed to create edge:", err);
    }
  }, [selectedCanvasId, setXYFlowEdges, setXYFlowNodes]);

  // ── Delete handler ──────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    // Capture state before deleting for undo
    const preDeleteState = captureState(xyflowNodes, xyflowEdges, xyflowGroups);

    for (const id of deleteConfirmItems) {
      try {
        if (xyflowNodes.find((n) => n.id === id)) {
          await safeInvoke("delete_canvas_node", { id });
        } else if (xyflowEdges.find((e) => e.id === id)) {
          await safeInvoke("delete_canvas_edge", { id });
        } else {
          await safeInvoke("delete_canvas_group", { id });
        }
      } catch (err) { console.error(err); }
    }

    // Push undo state before removing from local state
    pushUndo(preDeleteState);

    // Remove from local state
    setXYFlowNodes((nds) => nds.filter((n) => !deleteConfirmItems.includes(n.id)));
    setXYFlowEdges((eds) => eds.filter((e) => !deleteConfirmItems.includes(e.id)));
    setXYFlowGroups((gs) => gs.filter((g) => !deleteConfirmItems.includes(g.id)));
    setDeleteConfirmOpen(false);
    setDeleteConfirmItems([]);
  }, [deleteConfirmItems, xyflowNodes, xyflowEdges, xyflowGroups, setXYFlowNodes, setXYFlowEdges, setXYFlowGroups, captureState, pushUndo]);

  // ── Node modal helpers ──────────────────────────────────────────────────

  const getNodeModalData = useCallback(() => {
    if (!nodeModalNodeId) return { title: "", description: "", sources: [], tags: [] };
    const node = xyflowNodes.find((n) => n.id === nodeModalNodeId);
    if (!node) return { title: "", description: "", sources: [], tags: [] };
    const nodeData = node.data as Record<string, unknown>;
    return {
      title: (nodeData.title as string) || "",
      description: (nodeData.description as string) || "",
      sources: (nodeData.sources as { id: string; url: string; source_type: string }[]) || [],
      tags: (nodeData.tags as string[]) || [],
    };
  }, [nodeModalNodeId, xyflowNodes]);

  const handleNodeSave = useCallback(async (nodeData: { title: string; description: string }) => {
    if (!nodeModalNodeId) return;
    try {
      await safeInvoke("update_canvas_node", {
        id: nodeModalNodeId,
        title: nodeData.title,
        description: nodeData.description,
      });
      setXYFlowNodes((nds) =>
        nds.map((n) =>
          n.id === nodeModalNodeId
            ? { ...n, data: { ...n.data, title: nodeData.title, description: nodeData.description } }
            : n
        )
      );
    } catch (err) { console.error(err); }
  }, [nodeModalNodeId, setXYFlowNodes]);

  const handleAddTag = useCallback(async (tag: string) => {
    if (!nodeModalNodeId) return;
    try {
      await safeInvoke("add_canvas_tag", { nodeId: nodeModalNodeId, tag });
    } catch (err) { console.error(err); }
  }, [nodeModalNodeId]);

  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!nodeModalNodeId) return;
    try {
      await safeInvoke("remove_canvas_tag", { nodeId: nodeModalNodeId, tag });
    } catch (err) { console.error(err); }
  }, [nodeModalNodeId]);

  const handleAddSource = useCallback(async (url: string, sourceType: "file" | "link") => {
    if (!nodeModalNodeId) return;
    try {
      await safeInvoke("create_canvas_node_source", {
        nodeId: nodeModalNodeId,
        url,
        sourceType,
        sortOrder: 0,
      });
    } catch (err) { console.error(err); }
  }, [nodeModalNodeId]);

  const handleRemoveSource = useCallback(async (sourceId: string) => {
    if (!sourceId) return;
    try {
      await safeInvoke("delete_canvas_node_source", { id: sourceId });
    } catch (err) { console.error(err); }
  }, []);

  // ── Edge modal helpers ──────────────────────────────────────────────────

  const getEdgeModalData = useCallback(() => {
    if (!edgeModalEdgeId) return { label: "", metadataJson: null as string | null };
    const edge = xyflowEdges.find((e) => e.id === edgeModalEdgeId);
    if (!edge) return { label: "", metadataJson: null };
    return {
      label: (edge.label as string) || "",
      metadataJson: (edge.data as any)?.metadata_json || null,
    };
  }, [edgeModalEdgeId, xyflowEdges]);

  const handleEdgeSave = useCallback(async (label: string, metadataJson: string | null) => {
    if (!edgeModalEdgeId) return;
    try {
      await safeInvoke("update_canvas_edge", {
        id: edgeModalEdgeId,
        label: label || undefined,
        metadataJson: metadataJson || undefined,
      });
      setXYFlowEdges((eds) =>
        eds.map((e) =>
          e.id === edgeModalEdgeId
            ? { ...e, label, data: { ...e.data, metadata_json: metadataJson } }
            : e
        )
      );
    } catch (err) { console.error(err); }
  }, [edgeModalEdgeId, setXYFlowEdges]);

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

  // Recompute group bounds whenever nodes change
  useEffect(() => {
    setXYFlowGroups((groups) =>
      groups.map((g) => {
        const memberIds: string[] = (g.data as any).memberIds || [];
        const memberNodes = xyflowNodes.filter((n) => memberIds.includes(n.id));
        if (memberNodes.length === 0) return { ...g, data: { ...g.data, width: 200, height: 120 }, position: g.position };
        const minX = Math.min(...memberNodes.map((n) => n.position.x));
        const minY = Math.min(...memberNodes.map((n) => n.position.y));
        const maxX = Math.max(...memberNodes.map((n) => n.position.x + (n.width || 200)));
        const maxY = Math.max(...memberNodes.map((n) => n.position.y + (n.height || 100)));
        const padding = 40;
        return {
          ...g,
          position: { x: minX - padding, y: minY - padding },
          data: {
            ...g.data,
            width: Math.max(200, maxX - minX + padding * 2),
            height: Math.max(120, maxY - minY + padding * 2),
          },
        };
      })
    );
  }, [xyflowNodes, setXYFlowGroups]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

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

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedCanvasId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const entry = undo();
        if (entry) {
          setXYFlowNodes(entry.nodes);
          setXYFlowEdges(entry.edges);
          setXYFlowGroups(entry.groupNodes);
        }
        return;
      }

      // Redo: Cmd/Ctrl + Shift + Z
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const entry = redo();
        if (entry) {
          setXYFlowNodes(entry.nodes);
          setXYFlowEdges(entry.edges);
          setXYFlowGroups(entry.groupNodes);
        }
        return;
      }

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't fire if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

        e.preventDefault();

        // Determine what's selected
        const items: string[] = [];
        let entityType: "nodes" | "edges" | "groups" | "mixed" = "nodes";

        const selectedNodes = xyflowNodes.filter((n) => n.selected);
        const selectedEdges = xyflowEdges.filter((e) => e.selected);
        const selectedGroups = xyflowGroups.filter((g) => g.selected);

        const totalSelected = selectedNodes.length + selectedEdges.length + selectedGroups.length;
        if (totalSelected === 0) return;

        if (selectedNodes.length > 0 && selectedEdges.length === 0 && selectedGroups.length === 0) {
          items.push(...selectedNodes.map((n) => n.id));
          entityType = "nodes";
        } else if (selectedEdges.length > 0 && selectedNodes.length === 0 && selectedGroups.length === 0) {
          items.push(...selectedEdges.map((e) => e.id));
          entityType = "edges";
        } else if (selectedGroups.length > 0 && selectedNodes.length === 0 && selectedEdges.length === 0) {
          items.push(...selectedGroups.map((g) => g.id));
          entityType = "groups";
        } else {
          items.push(
            ...selectedNodes.map((n) => n.id),
            ...selectedEdges.map((e) => e.id),
            ...selectedGroups.map((g) => g.id),
          );
          entityType = "mixed";
        }

        setDeleteConfirmItems(items);
        setDeleteConfirmEntityType(entityType);
        setDeleteConfirmOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCanvasId, xyflowNodes, xyflowEdges, xyflowGroups, undo, redo, setXYFlowNodes, setXYFlowEdges, setXYFlowGroups]);

  // ── Helpers ────────────────────────────────────────────────────────────

  const getUniqueTagLabels = (tags: CanvasTag[]) => [...new Set(tags.map(t => t.tag))].sort();

  const allNodes = useMemo(() => [...xyflowGroups, ...xyflowNodes], [xyflowGroups, xyflowNodes]);

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
      <div className="canvas-list">
        <FilterableList
          items={filteredCanvases}
          totalCount={canvases.length}
          focusedIndex={focusedCanvasIndex}
          onFocusedIndexChange={setFocusedCanvasIndex}
          searchQuery={canvasFilterQuery}
          onSearchChange={setCanvasFilterQuery}
          searchPlaceholder="Filter canvases… (press /)"
          createLabel="New canvas"
          createKey="n"
          onCreateClick={() => setCanvasModalOpen({ mode: "create" })}
          onItemExtraKey={(canvas, e) => {
            if (e.key === "e" || e.key === "E") {
              e.preventDefault();
              setCanvasModalOpen({ mode: "rename", canvas });
            } else if (e.key === "Enter") {
              e.preventDefault();
              setSelectedCanvasId(canvas.id);
            }
          }}
          emptyMessage="No canvases yet"
          noMatchesMessage="No matching canvases"
        >
          {(canvas, idx, { isFocused, onFocus, onBlur, setCardRef }) => (
            <ListCard
              key={canvas.id}
              isFirstLoad={isFirstLoad}
              index={idx}
              isFocused={isFocused}
              onFocus={onFocus}
              onBlur={onBlur}
              cardRef={setCardRef}
              onClick={() => setSelectedCanvasId(canvas.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setCanvasModalOpen({ mode: "rename", canvas });
              }}
            >
              <div className="canvas-card__title">
                {canvas.name}
              </div>
              <div className="canvas-card__date">
                Created {new Date(canvas.created_at).toLocaleDateString()}
              </div>
            </ListCard>
          )}
        </FilterableList>

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

  return (
    <div className="visual-canvas-panel">

      {/* Header with back button and toolbar */}
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
        <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
          <Button variant="ghost" size="sm" onClick={async () => {
            if (!selectedCanvasId) return;
            try {
              const group = await safeInvoke("create_canvas_group", {
                canvasId: selectedCanvasId,
                label: "New Group",
                nodeIdsJson: "[]",
              }) as any;
              setXYFlowGroups((gs) => [...gs, {
                id: group.id,
                type: "canvasGroup",
                position: { x: 100, y: 100 },
                data: { label: group.label, memberIds: [], width: 200, height: 120 },
                draggable: false,
                selectable: true,
                style: { zIndex: -1 },
              }]);
            } catch (err) { console.error(err); }
          }}>
            + Group
          </Button>
          <Button variant="ghost" size="sm" onClick={async () => {
            if (!selectedCanvasId) return;
            try {
              const node = await safeInvoke("create_canvas_node", {
                canvasId: selectedCanvasId,
                title: "New Node",
                description: "",
                x: 200,
                y: 200,
                width: 200,
                height: 100,
              }) as any;
              const xyflowNode = backendNodeToXYFlowNode({ ...node, tags: [], sources: [] });
              setXYFlowNodes((nds) => [...nds, xyflowNode]);
            } catch (err) { console.error(err); }
          }}>
            + Node
          </Button>
        </div>
      </div>

      {/* Tag filter bar */}
      {tags.length > 0 && (
        <div className="canvas-tag-bar">
          <button
            className={`canvas-tag-pill ${!activeTagFilter ? 'canvas-tag-pill--active' : ''}`}
            onClick={() => setActiveTagFilter(null)}
          >
            All
          </button>
          {getUniqueTagLabels(tags).map(tag => (
            <button
              key={tag}
              className={`canvas-tag-pill ${activeTagFilter === tag ? 'canvas-tag-pill--active' : ''}`}
              onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div className="canvas-wrapper">
        <ReactFlow
          nodes={allNodes}
          edges={xyflowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          onNodeDragStart={() => {
            const state = captureState(xyflowNodes, xyflowEdges, xyflowGroups);
            dragStartStateRef.current = state;
          }}
          nodeTypes={{ canvasNode: CanvasNodeComponent, canvasGroup: CanvasGroupNodeComponent }}
          edgeTypes={{ canvasEdge: CanvasEdge }}
          defaultEdgeOptions={{ type: "canvasEdge" }}
          connectionLineComponent={CanvasConnectionLine}
          connectionRadius={40}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onNodeDoubleClick={(_event, node) => {
            if (node.type === "canvasGroup") {
              setGroupRenameId(node.id);
              setGroupRenameValue((node.data as any).label || "");
            } else {
              setNodeModalNodeId(node.id);
              setNodeModalOpen(true);
            }
          }}
          onEdgeDoubleClick={(_event, edge) => {
            setEdgeModalEdgeId(edge.id);
            setEdgeModalOpen(true);
          }}
          fitView
          deleteKeyCode={null}
          onNodeDragStop={(_event, node) => {
            // Push undo after drag completes
            if (dragStartStateRef.current) {
              pushUndo(dragStartStateRef.current);
              dragStartStateRef.current = null;
            }

            persistNodePosition(node.id, node.position.x, node.position.y);

            // Check if this node is now inside a group's bounds
            const nodeRect = {
              x: node.position.x,
              y: node.position.y,
              w: node.width || 200,
              h: node.height || 100,
            };

            xyflowGroups.forEach(async (group) => {
              const groupRect = {
                x: group.position.x,
                y: group.position.y,
                w: (group.data as any).width || 200,
                h: (group.data as any).height || 120,
              };
              const memberIds: string[] = (group.data as any).memberIds || [];
              const overlaps =
                nodeRect.x + nodeRect.w > groupRect.x &&
                nodeRect.x < groupRect.x + groupRect.w &&
                nodeRect.y + nodeRect.h > groupRect.y &&
                nodeRect.y < groupRect.y + groupRect.h;
              const isMember = memberIds.includes(node.id);

              if (overlaps && !isMember) {
                const newIds = [...memberIds, node.id];
                try {
                  await safeInvoke("update_canvas_group", {
                    id: group.id,
                    nodeIdsJson: JSON.stringify(newIds),
                  });
                  setXYFlowGroups((gs) =>
                    gs.map((g) => (g.id === group.id ? { ...g, data: { ...g.data, memberIds: newIds } } : g))
                  );
                } catch (err) { console.error(err); }
              } else if (!overlaps && isMember) {
                const newIds = memberIds.filter((id: string) => id !== node.id);
                try {
                  await safeInvoke("update_canvas_group", {
                    id: group.id,
                    nodeIdsJson: JSON.stringify(newIds),
                  });
                  setXYFlowGroups((gs) =>
                    gs.map((g) => (g.id === group.id ? { ...g, data: { ...g.data, memberIds: newIds } } : g))
                  );
                } catch (err) { console.error(err); }
              }
            });
          }}
          onMoveEnd={(_event, viewport) => {
            if (selectedCanvasId) {
              safeInvoke("update_canvas_view_state", {
                canvasId: selectedCanvasId,
                offsetX: viewport.x,
                offsetY: viewport.y,
                zoom: viewport.zoom,
              }).catch(() => {});
            }
          }}
        >
          <Background />
          <Controls />
        </ReactFlow>

        {/* Keyboard hints bar */}
        <div className="canvas-hints-bar">
          <kbd>Space</kbd> + drag pan
          <span className="canvas-hints-sep" />
          <kbd>⌘</kbd><kbd>Z</kbd> undo
          <span className="canvas-hints-sep" />
          <kbd>⌫</kbd> delete
          <span className="canvas-hints-sep" />
          <kbd>⌘</kbd><kbd>E</kbd> edit
        </div>

        {/* Undo / Redo bar */}
        <div className="canvas-undo-bar">
          <button
            className="canvas-undo-btn"
            disabled={!canUndo}
            onClick={() => {
              const entry = undo();
              if (entry) {
                setXYFlowNodes(entry.nodes);
                setXYFlowEdges(entry.edges);
                setXYFlowGroups(entry.groupNodes);
              }
            }}
            title="Undo (Ctrl+Z)"
          >
            <span className="canvas-undo-btn__icon">↩</span>
            <span className="canvas-undo-btn__count">Undo</span>
          </button>
          <button
            className="canvas-undo-btn"
            disabled={!canRedo}
            onClick={() => {
              const entry = redo();
              if (entry) {
                setXYFlowNodes(entry.nodes);
                setXYFlowEdges(entry.edges);
                setXYFlowGroups(entry.groupNodes);
              }
            }}
            title="Redo (Ctrl+Shift+Z)"
          >
            <span className="canvas-undo-btn__icon">↪</span>
            <span className="canvas-undo-btn__count">Redo</span>
          </button>
        </div>

        {/* Selection count badge */}
        {selectedNodeCount > 0 && (
          <div className="canvas-selection-count">
            {selectedNodeCount} node{selectedNodeCount !== 1 ? "s" : ""} selected
          </div>
        )}
      </div>

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

      {/* Node edit modal */}
      <NodeEditModal
        open={nodeModalOpen}
        onClose={() => { setNodeModalOpen(false); setNodeModalNodeId(null); }}
        data={getNodeModalData()}
        onSave={handleNodeSave}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onAddSource={handleAddSource}
        onRemoveSource={handleRemoveSource}
      />

      {/* Edge edit modal */}
      <EdgeEditModal
        open={edgeModalOpen}
        onClose={() => { setEdgeModalOpen(false); setEdgeModalEdgeId(null); }}
        label={getEdgeModalData().label}
        metadataJson={getEdgeModalData().metadataJson}
        onSave={handleEdgeSave}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={`Delete ${deleteConfirmItems.length} ${deleteConfirmEntityType}`}
        message={`Are you sure you want to delete ${deleteConfirmItems.length > 1 ? "these" : "this"} ${deleteConfirmEntityType.slice(0, -1)}${deleteConfirmItems.length > 1 ? "s" : ""}? This action cannot be undone via the undo stack.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        destructive
      />

      {/* Group rename dialog */}
      {groupRenameId && (
        <Dialog
          open={true}
          onClose={() => setGroupRenameId(null)}
          title="Rename Group"
          width={360}
        >
          <Input
            label="Group name"
            value={groupRenameValue}
            onChange={setGroupRenameValue}
            placeholder="Group name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                safeInvoke("update_canvas_group", {
                  id: groupRenameId,
                  label: groupRenameValue,
                }).then(() => {
                  setXYFlowGroups((gs) =>
                    gs.map((g) => (g.id === groupRenameId ? { ...g, data: { ...g.data, label: groupRenameValue } } : g))
                  );
                }).catch(console.error);
                setGroupRenameId(null);
              }
              if (e.key === "Escape") setGroupRenameId(null);
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
            <Button variant="ghost" onClick={() => setGroupRenameId(null)}>Cancel</Button>
            <Button variant="primary" onClick={async () => {
              try {
                await safeInvoke("update_canvas_group", { id: groupRenameId, label: groupRenameValue });
                setXYFlowGroups((gs) =>
                  gs.map((g) => (g.id === groupRenameId ? { ...g, data: { ...g.data, label: groupRenameValue } } : g))
                );
              } catch (err) { console.error(err); }
              setGroupRenameId(null);
            }}>Save</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function VisualCanvasPanel(props: PanelProps) {
  return (
    <ReactFlowProvider>
      <VisualCanvasPanelInner {...props} />
    </ReactFlowProvider>
  );
}

registerPanel("visual-canvas", "Visual Canvas", VisualCanvasPanel);

export default VisualCanvasPanel;
