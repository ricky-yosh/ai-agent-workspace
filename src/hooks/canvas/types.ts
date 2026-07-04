import type { CanvasNode } from "../../components/CanvasRenderer";

// Undo/Redo command types
export type CanvasCommand =
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

export const MAX_UNDO_STACK = 50;
