import { useState, useCallback, useRef, useEffect } from "react";
import type { CanvasNode } from "../../components/CanvasRenderer";
import { safeInvoke } from "../../safeInvoke";
import type { CanvasCommand } from "./types";
import { MAX_UNDO_STACK } from "./types";

export function useCanvasUndoRedo(params: {
  selectedCanvasId: string | null;
  nodesRef: React.RefObject<CanvasNode[]>;
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
  showToast: (message: string) => void;
}): {
  undoStack: CanvasCommand[];
  redoStack: CanvasCommand[];
  pushUndo: (command: CanvasCommand) => void;
  handleUndo: () => void;
  handleRedo: () => void;
} {
  const { selectedCanvasId, nodesRef, setNodes, showToast } = params;

  const [undoStack, setUndoStack] = useState<CanvasCommand[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasCommand[]>([]);
  const undoStackRef = useRef<CanvasCommand[]>([]);
  const redoStackRef = useRef<CanvasCommand[]>([]);

  // Clear undo/redo stacks when switching canvases
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    undoStackRef.current = [];
    redoStackRef.current = [];
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
          const nodeId = command.nodeId;
          const before = command.type === "update_node" ? command.before : { content: "", x: command.beforeX, y: command.beforeY };

          let contentToRestore = before.content;
          let xToRestore = before.x;
          let yToRestore = before.y;

          if (command.type === "update_node") {
            const currentNode = nodesRef.current.find((n) => n.id === nodeId);
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
          return true;
        }
      }
    } catch (err) {
      console.error("Failed to execute undo:", err);
      showToast("Undo failed");
      return false;
    }
    return false;
  }, [nodesRef, setNodes, showToast]);

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
            const currentNode = nodesRef.current.find((n) => n.id === nodeId);
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
  }, [nodesRef, setNodes, showToast]);

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

  return {
    undoStack,
    redoStack,
    pushUndo,
    handleUndo,
    handleRedo,
  };
}
