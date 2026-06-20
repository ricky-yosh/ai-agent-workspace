import { useMemo, useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import type { Screen, Vertex, Edge, Area, Axis } from "./types/screen";
import { getPanel } from "./panelRegistry";
import { PanelContext } from "./PanelContext";
import PanelTypeSelector from "./PanelTypeSelector";
import { disposeTerminal } from "./TerminalPanel";
import { safeInvoke } from "./safeInvoke";
import { resizeEdgeLocal } from "./screenGeometry";
import { areaRect, diffAreas, prefersReducedMotion, determineEnterSeam, determineExitCollapse } from "./screenMotion";
import type { AreaRect, SeamSide } from "./screenMotion";
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

  // Ref map of area DOM nodes keyed by area.id. Populated by the ref
  // callback on each area <div>; consumed by the enter FLIP (Bundle 2)
  // to find the DOM node for a newly-added area.
  const areaNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // ---------- Interaction state ----------
  const [sashDrag, setSashDrag] = useState<SashDragState | null>(null);
  const sashDragRef = useRef<SashDragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const sashMovedRef = useRef(false);

  // Ephemeral draft screen recomputed each frame during a sash drag.
  // Rendering reads `activeScreen = draftScreen ?? screen` so panels reflow
  // live under the cursor. Cleared only in the [screen] reset effect (+Escape).
  const [draftScreen, setDraftScreen] = useState<Screen | null>(null);
  // Base prop screen captured at drag start. resizeEdgeLocal is ALWAYS fed from
  // this (never the draft) to avoid cumulative drift.
  const dragBaseScreenRef = useRef<Screen | null>(null);

  const [splitDrag, setSplitDrag] = useState<SplitDragState | null>(null);
  const splitDragRef = useRef<SplitDragState | null>(null);

  const [joinMode, setJoinMode] = useState<JoinModeState | null>(null);
  const joinModeRef = useRef<JoinModeState | null>(null);
  joinModeRef.current = joinMode;

  // ---------- Motion state (Bundle 1: exit ghosts) ----------

  // The LAST committed `screen` prop (not the draft). Used to diff area sets
  // when a new committed screen arrives so we can animate removals/entrances.
  const prevCommittedScreenRef = useRef<Screen | null>(null);

  // Exiting ghost entries: one per area that was removed in the latest commit.
  // Each entry captures the area's full Area object + its last-known rect
  // (computed from the OLD screen's vertices) + the collapse direction toward
  // the absorbing survivor (computed at ghost-creation time from the new screen).
  interface ExitingGhost {
    area: Area;
    rect: AreaRect;
    /** Directional collapse info or null for a plain fade fallback. */
    collapse: SeamSide | null;
  }
  const [exitingAreas, setExitingAreas] = useState<ExitingGhost[]>([]);

  // Per-id map of setTimeout handles that remove individual ghosts after the
  // exit animation. Keyed by area.id so two removals within 220ms do not
  // prematurely clear each other's ghost (fixes the timer-race bug).
  const exitTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Ref map of ghost DOM nodes keyed by area.id. Used by the WAAPI exit
  // layout effect to find nodes for directional-collapse animation.
  const exitNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Tracks which ghost ids have already been animated by the WAAPI layout
  // effect so that state changes (e.g. a second ghost added) do not re-fire
  // the animation on an already-animating ghost.
  const animatedExitIdsRef = useRef<Set<string>>(new Set());

  // During a sash drag we render every panel from the ephemeral draft screen.
  // Only geometry/layout reads switch to `activeScreen`; non-geometry reads of
  // `screen` (child props, terminal ids, join/split logic) stay on `screen`.
  const activeScreen = draftScreen ?? screen;

  // ---------- Vertex lookup ----------
  const vertexMap = useMemo(() => {
    const map = new Map<string, Vertex>();
    for (const v of activeScreen.vertices) {
      map.set(v.id, v);
    }
    return map;
  }, [activeScreen.vertices]);

  // ---------- Areas to render ----------
  const areasToRender = zoomedAreaId
    ? activeScreen.areas.filter((a) => a.id === zoomedAreaId)
    : activeScreen.areas;

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

      const base = dragBaseScreenRef.current;
      if (!base) return;

      const clampedPos = Math.max(0, Math.min(1, rawPos));
      const snappedPos = snapPosition(clampedPos, base, edgeId, isHorizontal);
      const isSnapped = Math.abs(snappedPos - clampedPos) > 0.0001;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // Always recompute from the captured base, never the prior draft.
        try {
          setDraftScreen(resizeEdgeLocal(base, edgeId, snappedPos));
        } catch {
          // Leave the previous draft in place; don't crash the drag.
        }
        setSashDrag((prev) => (prev ? { ...prev, isSnapped } : null));
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
        const base = dragBaseScreenRef.current;
        if (!container || !base) return;
        const rect = container.getBoundingClientRect();

        const rawPos = isHorizontal
          ? 1 - (e.clientY - rect.top) / rect.height
          : (e.clientX - rect.left) / rect.width;

        const clampedPos = Math.max(0, Math.min(1, rawPos));
        // One snapped position used for BOTH the final rendered draft and the
        // commit, so the on-release swap is a visual no-op. (mouseup cancelled
        // the pending rAF above, so set the final draft here explicitly.)
        const finalPos = snapPosition(clampedPos, base, edgeId, isHorizontal);
        try {
          setDraftScreen(resizeEdgeLocal(base, edgeId, finalPos));
        } catch {
          // Leave the previous draft in place.
        }

        // Backend clamps but does NOT snap, so send the snapped value.
        safeInvoke<WorkspaceResult>("resize_edge", {
          sessionId: sessionIdRef.current,
          workspaceId: workspaceIdRef.current,
          edgeId,
          position: finalPos,
        }, onErrorRef.current)
          .then((result) => {
            onScreenChangeRef.current(result.current_screen);
          })
          .catch(() => {
            // Commit rejected: the screen prop won't change, so the [screen]
            // reset effect won't fire. Drop the draft here so panels snap back
            // to the authoritative geometry instead of lingering at the
            // uncommitted draft position.
            setDraftScreen(null);
            dragBaseScreenRef.current = null;
          });
      } else {
        // No movement (a plain click on the sash): nothing to commit, so the
        // [screen] reset effect won't fire. Drop the seeded draft here.
        setDraftScreen(null);
        dragBaseScreenRef.current = null;
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
        // Cancel: drop the draft, no commit.
        setDraftScreen(null);
        dragBaseScreenRef.current = null;
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
    // Run once per drag (stable while a drag is active), not per frame.
    // The handlers close over `screen`, which does not change mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sashDrag?.edgeId, sashDrag?.isHorizontal]);

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
    document.body.style.cursor = "crosshair";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
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
    // Clear the draft only here: the committed screen prop has now replaced the
    // draft, so the handoff from live drag to committed geometry is seamless.
    setDraftScreen(null);
    dragBaseScreenRef.current = null;
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

    // ------------------------------------------------------------------
    // Motion diff — Bundle 1: exit ghosts
    // ------------------------------------------------------------------
    const diff = diffAreas(prevCommittedScreenRef.current, screen);

    // CRITICAL GATING: a pure geometry commit (sash-resize settle) produces
    // an empty diff — no areas added or removed. When this is the case we
    // do NOTHING motion-related, preventing a double-animation where the
    // existing .screen-area geometry transition fights a ghost/enter FLIP
    // on the same nodes.
    if (diff.addedIds.size === 0 && diff.removed.length === 0) {
      // No set change — skip all motion work. The geometry transition on
      // .screen-area handles the resize animation.
      prevCommittedScreenRef.current = screen;
      return;
    }

    // --- Exit ghosts for removed areas ---
    if (diff.removed.length > 0) {
      if (prefersReducedMotion()) {
        // Reduced motion: remove instantly, no ghost.
        setExitingAreas([]);
      } else {
        // Build a vertex map from the OLD (prev) screen where the dying
        // areas' vertices still exist. This gives ghosts a fixed final rect.
        const prev = prevCommittedScreenRef.current!;
        const oldVertexMap = new Map<string, Vertex>();
        for (const v of prev.vertices) {
          oldVertexMap.set(v.id, v);
        }

        // Build a vertex map for the NEW (committed) screen to pass to
        // determineExitCollapse, so the function can find the absorber's
        // new bounds.
        const newVertexMap = new Map<string, Vertex>();
        for (const v of screen.vertices) {
          newVertexMap.set(v.id, v);
        }

        const ghosts: ExitingGhost[] = [];
        for (const area of diff.removed) {
          const rect = areaRect(area, oldVertexMap);
          if (rect) {
            // Compute the directional collapse toward the absorbing survivor.
            const collapse = determineExitCollapse(
              area,
              oldVertexMap,
              screen,
              newVertexMap,
            );
            ghosts.push({ area, rect, collapse });
          }
        }

        if (ghosts.length > 0) {
          // Merge with any existing ghosts (preserves ghosts from a prior
          // commit whose timer hasn't fired yet). Overwrites by id — safe
          // because area IDs are unique over the app lifetime.
          setExitingAreas((prev) => {
            const merged = new Map<string, ExitingGhost>();
            for (const g of prev) merged.set(g.area.id, g);
            for (const g of ghosts) merged.set(g.area.id, g);
            return Array.from(merged.values());
          });

          // Per-ghost removal timer. Each ghost is independently removed
          // via its own timeout, preventing the race where two quick
          // commits within 220ms would wipe each other's ghosts.
          for (const g of ghosts) {
            // If a timer for this id already exists (shouldn't happen,
            // but guard defensively), cancel it first.
            const existing = exitTimersRef.current.get(g.area.id);
            if (existing) clearTimeout(existing);

            const id = g.area.id;
            const timer = setTimeout(() => {
              setExitingAreas((prev) =>
                prev.filter((entry) => entry.area.id !== id),
              );
              exitTimersRef.current.delete(id);
              // Allow the animated set to be re-populated if the same
              // id ever re-appears (defensive).
              animatedExitIdsRef.current.delete(id);
            }, 220);
            exitTimersRef.current.set(id, timer);
          }
        }
      }
    }

    // Record this screen as the previous for the next commit.
    prevCommittedScreenRef.current = screen;
  }, [screen]);

  // Cleanup exit-animation timers on unmount so stale setState calls don't
  // hit a removed component.
  useEffect(() => {
    return () => {
      for (const t of exitTimersRef.current.values()) {
        clearTimeout(t);
      }
      exitTimersRef.current.clear();
    };
  }, []);

  // ------------------------------------------------------------------
  // Enter FLIP (Bundle 2): animate new panels growing from split seam
  // ------------------------------------------------------------------
  //
  // Runs BEFORE the browser paint (useLayoutEffect) so the animation
  // starts on the very first frame — no flash of the new panel at
  // full size before the scale begins.
  //
  // CRITICAL — no conflict with the existing geometry transition:
  //   The .screen-area CSS transitions left/top/width/height for
  //   surviving panels. This enter FLIP animates ONLY `transform`
  //   (scaleX / scaleY), which is an independent rendering channel.
  //   The two animations coexist without fighting — there is never a
  //   case where the same CSS property is animated by both.
  //
  // Reduced-motion gating happens here (prefersReducedMotion → skip).
  // The .screen-area CSS transition is also gated by
  //   `@media (prefers-reduced-motion: no-preference)`,
  // so geometry reflow is already instant when reduced motion is on.
  //
  // We compute `diffAreas` fresh here from `prevCommittedScreenRef.current`
  // (which still holds the old screen at this point of the commit cycle
  // because the [screen] useEffect hasn't updated it yet — it runs after
  // this layout effect).  The enter path does NOT read any intermediate
  // state set by the [screen] effect, so it stays independent.
  //
  // After this layout effect returns, the [screen] useEffect runs,
  // computes the same diff, handles exit ghosts, and updates
  // prevCommittedScreenRef. The double-diff is cheap (two Set ops).
  useLayoutEffect(() => {
    const prev = prevCommittedScreenRef.current;
    const diff = diffAreas(prev, screen);
    if (diff.addedIds.size === 0) return;

    // Reduced motion: the panels are already mounted at their final
    // rect by the render — no animation needed.
    if (prefersReducedMotion()) return;

    // Build a vertex map from the CURRENT screen (post-commit) so
    // determineEnterSeam can resolve the entering area's neighbours.
    const vmap = new Map(screen.vertices.map((v) => [v.id, v]));

    for (const id of diff.addedIds) {
      const node = areaNodeRefs.current.get(id);
      if (!node) continue;

      const area = screen.areas.find((a) => a.id === id);
      if (!area) continue;

      // Attempt to find the seam (shared divider edge) with the
      // surviving sibling.
      const seam = determineEnterSeam(area, screen, vmap);

      if (!seam) {
        // No unambiguous seam found — use a gentle center-scale +
        // opacity entrance so the panel never blinks in. This
        // fallback can trigger when vertices are missing or when
        // the new area has no adjacent sibling (shouldn't happen
        // for a normal split, but we guard against it).
        const fallbackAnim = node.animate(
          [
            { transform: "scale(0.6)", opacity: 0, transformOrigin: "center" },
            { transform: "scale(1)", opacity: 1, transformOrigin: "center" },
          ],
          {
            duration: 240,
            easing: "cubic-bezier(0, 0, 0.2, 1)",
            fill: "both",
          },
        );
        fallbackAnim.onfinish = () => fallbackAnim.cancel();
        continue;
      }

      // Transform-only enter FLIP.
      //
      // We animate ONLY the transform property (scaleX/scaleY) so
      // this animation does NOT fight the existing CSS geometry
      // transition (left/top/width/height) that the .screen-area
      // class provides for surviving panels. Transform is a
      // composited rendering channel — the browser applies it
      // after layout, so there is never a double-animation conflict.
      //
      // The `transformOrigin` keyframe locks the seam edge in place
      // while the scale expands outward from it, producing the
      // "grows from the divider" visual.
      const startTransform = `${seam.scaleAxis}(0)`;
      const endTransform = `${seam.scaleAxis}(1)`;

      const animation = node.animate(
        [
          {
            transform: startTransform,
            transformOrigin: seam.transformOrigin,
          },
          {
            transform: endTransform,
            transformOrigin: seam.transformOrigin,
          },
        ],
        {
          duration: 240,
          easing: "cubic-bezier(0, 0, 0.2, 1)",
          fill: "both",
        },
      );

      // Release fill="both" after the animation completes so the
      // element's computed style does not permanently carry the
      // transform. Letting the fill hold past end would interfere
      // with subsequent layout reads (the element's untransformed
      // rect is what matters for geometry).
      animation.onfinish = () => animation.cancel();
    }
  }, [screen]);

  // ------------------------------------------------------------------
  // Exit FLIP — WAAPI directional collapse (Bundle 3)
  // ------------------------------------------------------------------
  //
  // Runs BEFORE the browser paint (useLayoutEffect) so the collapse
  // animation starts on the very first frame the ghost appears — no
  // flash of the ghost at full opacity before the scale begins.
  //
  // Each ghost entry stores its pre-computed `collapse` direction
  // (computed in the [screen] useEffect above). When `collapse` is
  // non-null we animate the matching axis scale(1→0) toward the
  // absorber; when it is null (no overlapping survivor) we fall back
  // to a gentle center-scale + opacity fade.
  //
  // CRITICAL — no conflict with geometry transitions:
  //   This effect animates ONLY `transform` and `opacity` on the
  //   ghost div. The existing .screen-area CSS transition animates
  //   left/top/width/height on surviving areas. The ghost is a
  //   completely separate DOM subtree, so there is never a case
  //   where the same CSS property is animated on the same element
  //   by both.
  //
  // Reduced-motion gating is inherited from the [screen] effect:
  //   When prefersReducedMotion() is true, the [screen] effect
  //   clears exitingAreas to [], so this effect finds no ghosts
  //   and no-ops.
  useLayoutEffect(() => {
    if (exitingAreas.length === 0) return;

    for (const ghost of exitingAreas) {
      const node = exitNodeRefs.current.get(ghost.area.id);
      if (!node) continue;

      // Skip already-animated ghosts — prevents double-animation when
      // a new ghost is added while an older one is still in state.
      if (animatedExitIdsRef.current.has(ghost.area.id)) continue;
      animatedExitIdsRef.current.add(ghost.area.id);

      if (ghost.collapse) {
        // Directional collapse — scale the dominant axis to 0 toward
        // the absorber.  The transform-origin pins the seam edge so the
        // ghost shrinks INTO the survivor.
        const { transformOrigin, scaleAxis: axis } = ghost.collapse;
        node.animate(
          [
            {
              transform: "none",
              opacity: 1,
              transformOrigin,
            },
            {
              transform: `${axis}(0)`,
              opacity: 0,
              transformOrigin,
            },
          ],
          {
            duration: 200,
            // Accelerate: start slow, end fast — mimics "sucked into"
            // the absorber rather than a gentle fade.
            easing: "cubic-bezier(0.4, 0, 1, 1)",
            fill: "both",
          },
        );
      } else {
        // Fallback fade — no clear absorber; shrink slightly + fade out.
        node.animate(
          [
            {
              transform: "scale(1)",
              opacity: 1,
              transformOrigin: "center",
            },
            {
              transform: "scale(0.9)",
              opacity: 0,
              transformOrigin: "center",
            },
          ],
          {
            duration: 200,
            easing: "cubic-bezier(0.4, 0, 1, 1)",
            fill: "both",
          },
        );
      }
    }
  }, [exitingAreas]);

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

      const state: SashDragState = {
        edgeId: edge.id,
        isHorizontal,
      };
      sashMovedRef.current = false;
      sashDragRef.current = state;
      // Capture the base screen and seed the draft so the first frame already
      // renders from the draft path (activeScreen = draftScreen ?? screen).
      dragBaseScreenRef.current = screen;
      setDraftScreen(screen);
      setSashDrag(state);
    },
    [vertexMap, screen],
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
    () => activeScreen.edges.filter((e) => !e.border),
    [activeScreen.edges],
  );

  const canClose = activeScreen.areas.length > 1;

  return (
    <div
      ref={containerRef}
      className={"screen-container" + (sashDrag ? " screen-container--resizing" : "")}
    >
      {/* Render sashes for internal edges */}
      {!zoomedAreaId &&
        internalEdges.map((edge) => {
          const style = getSashStyle(edge);
          if (!style) return null;
          const isSnappedSash =
            sashDrag?.edgeId === edge.id && !!sashDrag.isSnapped;
          return (
            <div
              key={edge.id}
              className={
                "screen-sash" + (isSnappedSash ? " screen-sash--snapped" : "")
              }
              style={style}
              title="Drag to resize · double-click to join"
              onMouseDown={(e) => handleSashMouseDown(e, edge)}
              onDoubleClick={(e) => handleSashDoubleClick(e, edge)}
            />
          );
        })}

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
            ref={(el) => {
              if (el) {
                areaNodeRefs.current.set(area.id, el);
              } else {
                areaNodeRefs.current.delete(area.id);
              }
            }}
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
                  title="Drag to split"
                  onMouseDown={(e) => handleCornerMouseDown(e, area)}
                />
                <div
                  className="screen-corner-handle screen-corner-handle--tr"
                  title="Drag to split"
                  onMouseDown={(e) => handleCornerMouseDown(e, area)}
                />
                <div
                  className="screen-corner-handle screen-corner-handle--bl"
                  title="Drag to split"
                  onMouseDown={(e) => handleCornerMouseDown(e, area)}
                />
                <div
                  className="screen-corner-handle screen-corner-handle--br"
                  title="Drag to split"
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

      {/* Exit ghosts — Bundle 1: render removed areas for their exit animation */}
      {/* Each ghost is a fixed-position div at the removed area's LAST-KNOWN */}
      {/* rect (computed from the old screen's vertices). It renders only a */}
      {/* static filler — NO PanelComponent, NO terminal, NO corner handles, */}
      {/* NO close button — to guarantee zero effect re-runs and zero backend */}
      {/* resource usage (terminals are already disposed before close/join). */}
      {exitingAreas.map((ghost) => {
        const { area, rect } = ghost;
        return (
          <div
            key={`exit-${area.id}`}
            ref={(el) => {
              if (el) {
                exitNodeRefs.current.set(area.id, el);
              } else {
                exitNodeRefs.current.delete(area.id);
              }
            }}
            className="screen-area screen-area--exiting"
            style={{
              position: "absolute",
              left: `${rect.left}%`,
              top: `${rect.top}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
            }}
            data-exiting-area-id={area.id}
            aria-hidden="true"
          >
            <div className="screen-area-content screen-area--exiting-fill" />
          </div>
        );
      })}
    </div>
  );
}
