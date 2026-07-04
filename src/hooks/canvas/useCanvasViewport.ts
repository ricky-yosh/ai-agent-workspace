import { useState, useCallback, useRef, useEffect } from "react";
import { safeInvoke } from "../../safeInvoke";

export function useCanvasViewport(selectedCanvasId: string | null): {
  offsetX: number;
  offsetY: number;
  zoom: number;
  setOffsetX: (v: number) => void;
  setOffsetY: (v: number) => void;
  setZoom: (v: number) => void;
  loadViewState: () => void;
  saveViewState: (offsetX: number, offsetY: number, zoom: number) => void;
} {
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom] = useState(1);

  const viewStateSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return {
    offsetX,
    offsetY,
    zoom,
    setOffsetX,
    setOffsetY,
    setZoom,
    loadViewState,
    saveViewState,
  };
}
