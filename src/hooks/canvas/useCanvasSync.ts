import { useCallback, useEffect, useRef } from "react";
import { type Node, type Edge } from "@xyflow/react";
import { safeInvoke } from "../../safeInvoke";

export interface CanvasNode {
  id: string;
  canvas_id: string;
  title: string;
  description: string;
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

export interface CanvasNodeSource {
  id: string;
  node_id: string;
  url: string;
  source_type: string;
  sort_order: number;
  created_at: string;
}

export interface CanvasTag {
  id: string;
  node_id: string;
  tag: string;
  created_at: string;
}

export function backendNodeToXYFlowNode(node: CanvasNode): Node {
  return {
    id: node.id,
    type: "canvasNode",
    position: { x: node.x, y: node.y },
    data: {
      title: node.title,
      description: node.description,
      tags: [] as string[],
      sources: [] as { id: string; url: string; source_type: string }[],
    },
    width: node.width,
    height: node.height,
  };
}

export function backendEdgeToXYFlowEdge(edge: CanvasEdge): Edge {
  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    type: "canvasEdge",
    label: edge.label ?? "",
    data: { label: edge.label ?? "", metadata_json: edge.metadata_json },
  };
}

interface UseCanvasSyncProps {
  canvasId: string | null;
  sessionId: string;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
}

export function useCanvasSync({ canvasId, sessionId: _sessionId, setNodes, setEdges }: UseCanvasSyncProps) {
  const pendingNodeIds = useRef<Set<string>>(new Set());

  const fetchNodes = useCallback(async (id: string) => {
    const [backendNodes, backendTags, backendSources] = await Promise.all([
      safeInvoke<CanvasNode[]>("list_canvas_nodes", { canvasId: id }),
      safeInvoke<CanvasTag[]>("list_canvas_tags_by_canvas", { canvasId: id }),
      safeInvoke<CanvasNodeSource[]>("list_canvas_node_sources", { nodeId: "__all__" }).catch(() => [] as CanvasNodeSource[]),
    ]);

    // Group tags and sources by node_id
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

    const xyflowNodes = backendNodes.map((n) => {
      const base = backendNodeToXYFlowNode(n);
      return {
        ...base,
        data: {
          ...base.data,
          tags: tagsByNode.get(n.id) || [],
          sources: sourcesByNode.get(n.id) || [],
        },
      };
    });
    setNodes(xyflowNodes);
  }, [setNodes]);

  const fetchEdges = useCallback(async (id: string) => {
    const backendEdges = await safeInvoke<CanvasEdge[]>("list_canvas_edges", { canvasId: id });
    const xyflowEdges = backendEdges.map(backendEdgeToXYFlowEdge);
    setEdges(xyflowEdges);
  }, [setEdges]);

  // Fetch on canvas change
  useEffect(() => {
    if (canvasId) {
      pendingNodeIds.current.clear();
      fetchNodes(canvasId);
      fetchEdges(canvasId);
    }
  }, [canvasId, fetchNodes, fetchEdges]);

  // Listen for CDC events (window events dispatched by the Tauri event bridge)
  useEffect(() => {
    if (!canvasId) return;

    // The Tauri events are already listened to at the panel level and trigger a re-fetch.
    // This hook is synced via canvasId changes triggering the fetch effect above.
    // The panel component uses useTauriEvent to listen and re-trigger.
  }, [canvasId, fetchNodes, fetchEdges]);

  const persistNodePosition = useCallback(async (nodeId: string, x: number, y: number) => {
    pendingNodeIds.current.add(nodeId);
    try {
      await safeInvoke("update_canvas_node", { id: nodeId, x, y });
    } finally {
      pendingNodeIds.current.delete(nodeId);
    }
  }, []);

  const fetchTags = useCallback(async (id: string) => {
    return safeInvoke<CanvasTag[]>("list_canvas_tags_by_canvas", { canvasId: id });
  }, []);

  return { persistNodePosition, pendingNodeIds, fetchTags };
}
