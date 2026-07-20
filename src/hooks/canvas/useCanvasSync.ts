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
  tags_json: string | null;
  sources_json: string | null;
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

export interface NodeSource {
  url: string;
  source_type: string;
  sort_order: number;
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSources(sourcesJson: string | null): NodeSource[] {
  if (!sourcesJson) return [];
  try {
    const parsed = JSON.parse(sourcesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function backendNodeToXYFlowNode(node: CanvasNode): Node {
  return {
    id: node.id,
    type: "canvasNode",
    position: { x: node.x, y: node.y },
    data: {
      title: node.title,
      description: node.description,
      tags: parseTags(node.tags_json),
      sources: parseSources(node.sources_json),
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
    const backendNodes = await safeInvoke<CanvasNode[]>("list_canvas_nodes", { canvasId: id });
    const xyflowNodes = backendNodes.map(backendNodeToXYFlowNode);
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

  return { persistNodePosition, pendingNodeIds };
}
