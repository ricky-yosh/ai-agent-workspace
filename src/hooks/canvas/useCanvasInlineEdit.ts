import { useState, useCallback, useRef, useEffect } from "react";
import type { CanvasNode } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";
import type { CanvasCommand } from "./types";

export function useCanvasInlineEdit(params: {
  nodes: CanvasNode[];
  pushUndo: (command: CanvasCommand) => void;
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}): {
  editingNodeId: string | null;
  setEditingNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  editingValue: string;
  setEditingValue: (v: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  handleNodeDoubleClick: (nodeId: string) => void;
  confirmEdit: () => void;
  cancelEdit: () => void;
  handleEditKeyDown: (e: React.KeyboardEvent) => void;
} {
  const { nodes, pushUndo, setNodes, setSelectedNodeIds } = params;

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Enter edit mode on double-click
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setEditingNodeId(node.id);
    setEditingValue(node.content);
    // Clear selection when entering edit mode
    setSelectedNodeIds(new Set());
  }, [nodes, setSelectedNodeIds]);

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
  }, [editingNodeId, editingValue, nodes, pushUndo, setNodes]);

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

  // Auto-focus and select all text when entering edit mode
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      const input = editInputRef.current;
      // Use requestAnimationFrame to ensure the foreignObject input is mounted,
      // then a micro-delay to handle cases where the DOM update hasn't propagated
      requestAnimationFrame(() => {
        input.focus();
        input.select();
        // Fallback: if focus didn't take (foreignObject timing), retry once
        if (document.activeElement !== input) {
          setTimeout(() => {
            input.focus();
            input.select();
          }, 16);
        }
      });
    }
  }, [editingNodeId]);

  return {
    editingNodeId,
    setEditingNodeId,
    editingValue,
    setEditingValue,
    editInputRef,
    handleNodeDoubleClick,
    confirmEdit,
    cancelEdit,
    handleEditKeyDown,
  };
}
