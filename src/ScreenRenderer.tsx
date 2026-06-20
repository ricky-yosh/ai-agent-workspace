import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import type { Screen, Vertex, Edge, Area, Axis } from "./types/screen";
import { getPanel } from "./panelRegistry";
import { PanelContext } from "./PanelContext";
import PanelTypeSelector from "./PanelTypeSelector";
import { disposeTerminal } from "./TerminalPanel";
import { safeInvoke } from "./safeInvoke";
import "./ScreenRenderer.css";

const EPSILON = 0.0001;
const SASH_SIZE = 4; // px
const MIN_DRAG_DISTANCE = 24;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspaceResult {
  current_screen: Screen;
}

interface ScreenRendererProps {
  workspaceId: string;
  sessionId: string;
  screen: Screen;
  focusedAreaId?: string | null;
  onFocusedAreaChange?: (areaId: string | null) => void;
  zoomedAreaId?: string | null;
  onScreenChange: (screen: Screen) => void;
  onError?: (message: string) => void;
}

interface SashDragState {
  edgeId: string;
  isHorizontal: boolean;
  position: number;
  isSnapped?: boolean;
}

interface SplitDragState {
  area: Area;
  areaRect: DOMRect;
  axis: Axis;
  cursorX: number;
  cursorY: number;
  dragDistance: number;
}

interface JoinModeState {
  edge: Edge;
  adjacentAreas: [Area, Area];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if two collinear segments [a1, a2] and [b1, b2] overlap (interval length > 0). */
function segmentsOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  const [amin, amax] = a1 < a2 ? [a1, a2] : [a2, a1];
  const [bmin, bmax] = b1 < b2 ? [b1, b2] : [b2, b1];
  return Math.min(amax, bmax) - Math.max(amin, bmin) > EPSILON;
}

/** Find the areas whose boundary overlaps the edge segment. */
function findAdjacentAreas(screen: Screen, edge: Edge): Area[] {
  const v1 = screen.vertices.find((v) => v.id === edge.v1);
  const v2 = screen.vertices.find((v) => v.id === edge.v2);
  if (!v1 || !v2) return [];

  const ex1 = v1.x, ey1 = v1.y;
  const ex2 = v2.x, ey2 = v2.y;

  return screen.areas.filter((a) => {
    const av1 = screen.vertices.find((v) => v.id === a.v1);
    const av2 = screen.vertices.find((v) => v.id === a.v2);
    const av3 = screen.vertices.find((v) => v.id === a.v3);
    const av4 = screen.vertices.find((v) => v.id === a.v4);
    if (!av1 || !av2 || !av3 || !av4) return false;

    // Area bounds: v1=BL, v2=TL, v3=TR, v4=BR
    const left = av1.x, bottom = av1.y, right = av3.x, top = av3.y;

    // Check if edge overlaps any of the area's 4 sides:
    // Bottom: y=bottom, x in [left, right]
    // Top: y=top, x in [left, right]
    // Left: x=left, y in [bottom, top]
    // Right: x=right, y in [bottom, top]

    const isHorizontal = Math.abs(ey1 - ey2) < EPSILON;
    const isVertical = Math.abs(ex1 - ex2) < EPSILON;

    if (isHorizontal && Math.abs(ey1 - bottom) < EPSILON && segmentsOverlap(ex1, ex2, left, right)) {
      return true; // overlaps bottom side
    }
    if (isHorizontal && Math.abs(ey1 - top) < EPSILON && segmentsOverlap(ex1, ex2, left, right)) {
      return true; // overlaps top side
    }
    if (isVertical && Math.abs(ex1 - left) < EPSILON && segmentsOverlap(ey1, ey2, bottom, top)) {
      return true; // overlaps left side
    }
    if (isVertical && Math.abs(ex1 - right) < EPSILON && segmentsOverlap(ey1, ey2, bottom, top)) {
      return true; // overlaps right side
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScreenRenderer({
  workspaceId,
  sessionId,
  screen,
  focusedAreaId = null,
  onFocusedAreaChange,
  zoomedAreaId = null,
  onScreenChange,
  onError,
}: ScreenRendererProps) {
  // ---------- Refs for stable closures ----------
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const onScreenChangeRef = useRef(onScreenChange);
  onScreenChangeRef.current = onScreenChange;
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // ---------- Interaction state ----------
  const [sashDrag, setSashDrag] = useState<SashDragState | null>(null);
  const sashDragRef = useRef<SashDragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const sashMovedRef = useRef(false);

  const [splitDrag, setSplitDrag] = useState<SplitDragState | null>(null);
  const splitDragRef = useRef<SplitDragState | null>(null);

  const [joinMode, setJoinMode] = useState<JoinModeState | null>(null);
  const joinModeRef = useRef<JoinModeState | null>(null);
  joinModeRef.current = joinMode;

  // ---------- Vertex lookup ----------
  const vertexMap = useMemo(() => {
    const map = new Map<string, Vertex>();
    for (const v of screen.vertices) {
      map.set(v.id, v);
    }
    return map;
  }, [screen.vertices]);

  // ---------- Areas to render ----------
  const areasToRender = zoomedAreaId
    ? screen.areas.filter((a) => a.id === zoomedAreaId)
    : screen.areas;

  // ------------------------------------------------------------------
  // Resize snapping helpers
  // ------------------------------------------------------------------

  const SNAP_GRID = 1 / 12; // ~8.33%
  const SNAP_THRESHOLD = 0.015; // snap if within 1.5% of a snap point

  function snapPosition(
    rawPos: number,
    currentScreen: Screen,
    edgeId: string,
    isHorizontal: boolean,
  ): number {
    // 1. Grid snap
    let snapped = rawPos;
    const gridSnapped = Math.round(rawPos / SNAP_GRID) * SNAP_GRID;
    if (Math.abs(gridSnapped - rawPos) < SNAP_THRESHOLD) {
      snapped = gridSnapped;
    }

    // 2. Vertex snap — find other vertices on the same axis near this position
    const edge = currentScreen.edges.find((e) => e.id === edgeId);
    if (!edge) return snapped;

    const axisCoord: "x" | "y" = isHorizontal ? "y" : "x";

    for (const v of currentScreen.vertices) {
      const vertexPos = axisCoord === "x" ? v.x : v.y;
      if (Math.abs(vertexPos - snapped) < SNAP_THRESHOLD) {
        snapped = vertexPos;
        break;
      }
    }

    return snapped;
  }

  // ------------------------------------------------------------------
  // Sash drag
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!sashDrag) return;

    const { edgeId, isHorizontal } = sashDrag;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      sashMovedRef.current = true;
      const rect = container.getBoundingClientRect();

      // screen coords: 0-1, origin bottom-left
      const rawPos = isHorizontal
        ? 1 - (e.clientY - rect.top) / rect.height
        : (e.clientX - rect.left) / rect.width;

      const clampedPos = Math.max(0, Math.min(1, rawPos));
      const snappedPos = snapPosition(clampedPos, screen, edgeId, isHorizontal);
      const isSnapped = Math.abs(snappedPos - clampedPos) > 0.0001;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setSashDrag((prev) =>
          prev ? { ...prev, position: snappedPos, isSnapped } : null,
        );
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      sashDragRef.current = null;
      setSashDrag(null);

      if (sashMovedRef.current) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        const rawPos = isHorizontal
          ? 1 - (e.clientY - rect.top) / rect.height
          : (e.clientX - rect.left) / rect.width;

        const clampedPos = Math.max(0, Math.min(1, rawPos));
        const finalPos = snapPosition(clampedPos, screen, edgeId, isHorizontal);

        safeInvoke<WorkspaceResult>("resize_edge", {
          sessionId: sessionIdRef.current,
          workspaceId: workspaceIdRef.current,
          edgeId,
          position: finalPos,
        }, onErrorRef.current)
          .then((result) => {
            onScreenChangeRef.current(result.current_screen);
          })
          .catch(() => {});
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        sashDragRef.current = null;
        setSashDrag(null);
      }
    };

    document.body.style.cursor = isHorizontal ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sashDrag]);

  // ------------------------------------------------------------------
  // Split drag
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!splitDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const state = splitDragRef.current;
      if (!state) return;

      const dx = e.clientX - (state.areaRect.left + state.areaRect.width / 2);
      const dy = e.clientY - (state.areaRect.top + state.areaRect.height / 2);
      const dragDistance = Math.sqrt(dx * dx + dy * dy);

      // Determine axis from drag direction
      const absDx = Math.abs(e.clientX - (state.areaRect.left + state.areaRect.width / 2));
      const absDy = Math.abs(e.clientY - (state.areaRect.top + state.areaRect.height / 2));
      const axis: Axis = absDx > absDy ? "vertical" : "horizontal";

      const updated: SplitDragState = {
        ...state,
        axis,
        cursorX: e.clientX,
        cursorY: e.clientY,
        dragDistance,
      };
      splitDragRef.current = updated;
      setSplitDrag(updated);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const state = splitDragRef.current;
      splitDragRef.current = null;
      setSplitDrag(null);

      if (!state) return;
      if (state.dragDistance < MIN_DRAG_DISTANCE) return;

      // Compute factor relative to the area
      let factor: number;
      if (state.axis === "vertical") {
        // vertical split → left/right, factor = 0 at left, 1 at right
        factor =
          (e.clientX - state.areaRect.left) / state.areaRect.width;
      } else {
        // horizontal split → top/bottom, factor = 0 at bottom, 1 at top
        factor =
          (state.areaRect.bottom - e.clientY) / state.areaRect.height;
      }
      factor = Math.max(0.05, Math.min(0.95, factor));

      safeInvoke<WorkspaceResult>("split_area", {
        sessionId: sessionIdRef.current,
        workspaceId: workspaceIdRef.current,
        areaId: state.area.id,
        axis: state.axis,
        factor,
      }, onErrorRef.current)
        .then((result) => {
          onScreenChangeRef.current(result.current_screen);
        })
        .catch(() => {});
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        splitDragRef.current = null;
        setSplitDrag(null);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (splitDragRef.current) {
        e.preventDefault();
        splitDragRef.current = null;
        setSplitDrag(null);
      }
    };

    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [splitDrag]);

  // ------------------------------------------------------------------
  // Join mode
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!joinMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setJoinMode(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside any area overlay
      const target = e.target as HTMLElement;
      if (!target.closest("[data-join-area]")) {
        setJoinMode(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Use capture phase so we process before area focus click
    document.addEventListener("mousedown", handleClickOutside, true);

    return () => {
      document.body.style.cursor = "";
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [joinMode]);

  // Reset interaction states when screen changes (command completed successfully)
  useEffect(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setSashDrag(null);
    sashDragRef.current = null;
    setSplitDrag(null);
    splitDragRef.current = null;
    // Preserve join mode if its areas still exist in the new screen
    if (
      joinModeRef.current &&
      joinModeRef.current.adjacentAreas.every((a) =>
        screen.areas.some((sa) => sa.id === a.id),
      )
    ) {
      // keep join mode active
    } else {
      setJoinMode(null);
    }
  }, [screen]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleSashMouseDown = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      if (splitDragRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const v1 = vertexMap.get(edge.v1);
      const v2 = vertexMap.get(edge.v2);
      if (!v1 || !v2) return;

      const isHorizontal = Math.abs(v1.y - v2.y) < EPSILON;
      const position = isHorizontal ? v1.y : v1.x;

      const state: SashDragState = {
        edgeId: edge.id,
        isHorizontal,
        position,
      };
      sashMovedRef.current = false;
      sashDragRef.current = state;
      setSashDrag(state);
    },
    [vertexMap],
  );

  const handleSashDoubleClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.preventDefault();
      e.stopPropagation();
      // Don't enter join mode during sash drag
      if (sashDragRef.current) return;

      const adjacent = findAdjacentAreas(screen, edge);
      if (adjacent.length !== 2) return; // should not happen for internal edges
      setJoinMode({ edge, adjacentAreas: adjacent as [Area, Area] });
    },
    [screen],
  );

  const handleCornerMouseDown = useCallback(
    (e: React.MouseEvent, area: Area) => {
      if (sashDragRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget.parentElement!;
      const areaRect = el.getBoundingClientRect();

      // Check if any nearby area has this corner too (to find the "start" split position)
      const v1 = vertexMap.get(area.v1);
      const v2 = vertexMap.get(area.v2);
      const v3 = vertexMap.get(area.v3);
      const v4 = vertexMap.get(area.v4);
      if (!v1 || !v2 || !v3 || !v4) return;

      const absDx = Math.abs(e.clientX - (areaRect.left + areaRect.width / 2));
      const absDy = Math.abs(e.clientY - (areaRect.top + areaRect.height / 2));
      const axis: Axis = absDx > absDy ? "vertical" : "horizontal";

      const state: SplitDragState = {
        area,
        areaRect,
        axis,
        cursorX: e.clientX,
        cursorY: e.clientY,
        dragDistance: 0,
      };
      splitDragRef.current = state;
      setSplitDrag(state);
    },
    [vertexMap],
  );

  const handleJoinAreaClick = useCallback(
    (areaId: string) => {
      const mode = joinMode;
      if (!mode) return;

      const [areaA, areaB] = mode.adjacentAreas;
      // Clicked area is the target (survivor); the other is source (absorbed)
      const targetId = areaId;
      const sourceId = areaA.id === areaId ? areaB.id : areaA.id;
      const source = areaA.id === areaId ? areaB : areaA;

      setJoinMode(null);

      // Dispose source terminal if it has one
      if (source.terminal_id) {
        disposeTerminal(source.terminal_id);
      }

      safeInvoke<WorkspaceResult>("join_areas", {
        sessionId: sessionIdRef.current,
        workspaceId: workspaceIdRef.current,
        sourceAreaId: sourceId,
        targetAreaId: targetId,
      }, onErrorRef.current)
        .then((result) => {
          onScreenChangeRef.current(result.current_screen);
        })
        .catch(() => {});
    },
    [joinMode],
  );

  const handleClose = useCallback(
    (area: Area) => {
      // Dispose terminal first if present
      if (area.terminal_id) {
        disposeTerminal(area.terminal_id);
      }

      safeInvoke<WorkspaceResult>("close_area", {
        sessionId: sessionIdRef.current,
        workspaceId: workspaceIdRef.current,
        areaId: area.id,
      }, onErrorRef.current)
        .then((result) => {
          onScreenChangeRef.current(result.current_screen);
        })
        .catch(() => {});
    },
    [],
  );

  const handlePanelTypeChange = useCallback(
    (area: Area, newType: string) => {
      // Dispose terminal if switching away from terminal
      if (
        area.panel_type === "terminal" &&
        newType !== "terminal" &&
        area.terminal_id
      ) {
        disposeTerminal(area.terminal_id);
      }

      safeInvoke<WorkspaceResult>("change_panel_type", {
        sessionId: sessionIdRef.current,
        workspaceId: workspaceIdRef.current,
        areaId: area.id,
        panelType: newType,
      }, onErrorRef.current)
        .then((result) => {
          onScreenChangeRef.current(result.current_screen);
        })
        .catch(() => {});
    },
    [],
  );

  // ------------------------------------------------------------------
  // Edge helpers for rendering
  // ------------------------------------------------------------------

  /** Get orientation info for an edge */
  function getEdgeOrientation(edge: Edge) {
    const v1 = vertexMap.get(edge.v1);
    const v2 = vertexMap.get(edge.v2);
    if (!v1 || !v2) return null;

    const isHorizontal = Math.abs(v1.y - v2.y) < EPSILON;
    const isVertical = Math.abs(v1.x - v2.x) < EPSILON;
    if (!isHorizontal && !isVertical) return null; // not axis-aligned (shouldn't happen)

    return { v1, v2, isHorizontal, isVertical };
  }

  /** Compute sash style for an internal edge */
  function getSashStyle(edge: Edge) {
    const info = getEdgeOrientation(edge);
    if (!info) return null;

    const { v1, v2, isHorizontal, isVertical } = info;

    if (isVertical) {
      // Vertical sash (constant x)
      const left = `${v1.x * 100}%`;
      const topDOM = `${(1 - Math.max(v1.y, v2.y)) * 100}%`;
      const height = `${Math.abs(v1.y - v2.y) * 100}%`;
      return {
        position: "absolute" as const,
        left,
        top: topDOM,
        width: SASH_SIZE,
        height,
        cursor: "col-resize",
        transform: "translateX(-50%)",
      };
    }

    if (isHorizontal) {
      // Horizontal sash (constant y)
      const topDOM = `${(1 - v1.y) * 100}%`;
      const left = `${Math.min(v1.x, v2.x) * 100}%`;
      const width = `${Math.abs(v1.x - v2.x) * 100}%`;
      return {
        position: "absolute" as const,
        top: topDOM,
        left,
        width,
        height: SASH_SIZE,
        cursor: "row-resize",
        transform: "translateY(-50%)",
      };
    }

    return null;
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  // Internal edges (non-border) for sash rendering
  const internalEdges = useMemo(
    () => screen.edges.filter((e) => !e.border),
    [screen.edges],
  );

  const canClose = screen.areas.length > 1;

  return (
    <div ref={containerRef} className="screen-container">
      {/* Render sashes for internal edges */}
      {!zoomedAreaId &&
        internalEdges.map((edge) => {
          const style = getSashStyle(edge);
          if (!style) return null;
          return (
            <div
              key={edge.id}
              className="screen-sash"
              style={style}
              onMouseDown={(e) => handleSashMouseDown(e, edge)}
              onDoubleClick={(e) => handleSashDoubleClick(e, edge)}
            />
          );
        })}

      {/* Sash drag preview line */}
      {sashDrag && (
        <div
          className={
            "screen-sash-preview" +
            (sashDrag.isSnapped ? " screen-sash-preview--snapped" : "")
          }
          style={
            sashDrag.isHorizontal
              ? {
                  top: `${(1 - sashDrag.position) * 100}%`,
                  left: 0,
                  width: "100%",
                  height: 2,
                }
              : {
                  left: `${sashDrag.position * 100}%`,
                  top: 0,
                  width: 2,
                  height: "100%",
                }
          }
        />
      )}

      {/* Render areas */}
      {areasToRender.map((area) => {
        const v1 = vertexMap.get(area.v1);
        const v2 = vertexMap.get(area.v2);
        const v3 = vertexMap.get(area.v3);
        const v4 = vertexMap.get(area.v4);
        if (!v1 || !v2 || !v3 || !v4) return null;

        const left = v1.x * 100;
        const top = (1 - v2.y) * 100;
        const width = (v3.x - v1.x) * 100;
        const height = (v2.y - v1.y) * 100;

        const isFocused = focusedAreaId === area.id;
        const PanelComponent = getPanel(area.panel_type);

        // Check if this area is in join mode
        const isJoinArea =
          joinMode?.adjacentAreas.some((a) => a.id === area.id) ?? false;

        // Split preview for this area
        const isSplitArea = splitDrag?.area.id === area.id;

        return (
          <div
            key={area.id}
            className={
              "screen-area" +
              (isFocused ? " screen-area--focused" : "") +
              (isJoinArea ? " screen-area--join-mode" : "")
            }
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
            onClick={(e) => {
              // If in join mode, clicking on one of the adjacent areas triggers the join
              if (isJoinArea && joinMode) {
                e.stopPropagation();
                handleJoinAreaClick(area.id);
                return;
              }
              onFocusedAreaChange?.(area.id);
            }}
            data-area-id={area.id}
          >
            {/* Corner handles for split (only when not zoomed and not dragging) */}
            {!zoomedAreaId && !splitDrag && (
              <>
                <div
                  className="screen-corner-handle screen-corner-handle--tl"
                  onMouseDown={(e) => handleCornerMouseDown(e, area)}
                />
                <div
                  className="screen-corner-handle screen-corner-handle--tr"
                  onMouseDown={(e) => handleCornerMouseDown(e, area)}
                />
                <div
                  className="screen-corner-handle screen-corner-handle--bl"
                  onMouseDown={(e) => handleCornerMouseDown(e, area)}
                />
                <div
                  className="screen-corner-handle screen-corner-handle--br"
                  onMouseDown={(e) => handleCornerMouseDown(e, area)}
                />
              </>
            )}

            {/* Close button */}
            {canClose && !zoomedAreaId && (
              <button
                className="screen-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose(area);
                }}
                title="Close panel"
              >
                ×
              </button>
            )}

            {/* Panel content */}
            {PanelComponent ? (
              <PanelContext.Provider
                value={{
                  workspaceId,
                  sessionId,
                  areaId: area.id,
                  terminalId: area.terminal_id,
                  focusedAreaId,
                }}
              >
                <PanelTypeSelector
                  currentType={area.panel_type}
                  onTypeSelect={(newType) =>
                    handlePanelTypeChange(area, newType)
                  }
                />
                <div className="screen-area-content">
                  <PanelComponent panelType={area.panel_type} />
                </div>
              </PanelContext.Provider>
            ) : (
              <>
                <PanelTypeSelector
                  currentType={area.panel_type}
                  onTypeSelect={(newType) =>
                    handlePanelTypeChange(area, newType)
                  }
                />
                <div className="screen-area-content screen-area-unknown">
                  {area.panel_type}
                </div>
              </>
            )}

            {/* Join mode overlay */}
            {isJoinArea && joinMode && (
              <div
                className="screen-join-overlay"
                data-join-area={area.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleJoinAreaClick(area.id);
                }}
              >
                <span className="screen-join-label">Click to keep</span>
              </div>
            )}

            {/* Split preview line */}
            {isSplitArea && splitDrag && splitDrag.dragDistance >= MIN_DRAG_DISTANCE && (
              <div className="screen-split-preview-container">
                <div
                  className="screen-split-preview"
                  style={
                    splitDrag.axis === "vertical"
                      ? {
                          left: `${Math.max(0, Math.min(100, ((splitDrag.cursorX - splitDrag.areaRect.left) / splitDrag.areaRect.width) * 100))}%`,
                          top: 0,
                          width: 2,
                          height: "100%",
                        }
                      : {
                          top: `${Math.max(0, Math.min(100, ((splitDrag.cursorY - splitDrag.areaRect.top) / splitDrag.areaRect.height) * 100))}%`,
                          left: 0,
                          height: 2,
                          width: "100%",
                        }
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
