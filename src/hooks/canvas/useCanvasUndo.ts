import { useCallback, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";

interface UndoEntry {
  nodes: Node[];
  edges: Edge[];
  groupNodes: Node[];
}

const MAX_UNDO = 50;

export function useCanvasUndo() {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const captureState = useCallback((nodes: Node[], edges: Edge[], groupNodes: Node[]) => {
    return { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)), groupNodes: JSON.parse(JSON.stringify(groupNodes)) };
  }, []);

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return null;
    redoStack.current.push(entry);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    return entry;
  }, []);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return null;
    undoStack.current.push(entry);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    return entry;
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return { captureState, pushUndo, undo, redo, canUndo, canRedo, clear };
}
