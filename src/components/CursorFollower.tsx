import { useRef, useEffect, useCallback } from "react";
import "./CursorHud.css";

const LERP = 0.18;
const OFFSET_X = 0;
const OFFSET_Y = 20;
const GRID = 20;
const PULSE_MS = 500;

type CursorKind = "canvas" | "node" | "edgeRewire" | "placing" | "dragging";

interface LabelSet {
  left: string;
  right: string;
  shift: string;
}

const LABELS: Record<CursorKind, LabelSet> = {
  canvas: { left: "", right: "Add", shift: "" },
  node: { left: "Select", right: "Configure", shift: "Edge" },
  edgeRewire: { left: "Rewire", right: "", shift: "" },
  placing: { left: "Place", right: "Cancel", shift: "" },
  dragging: { left: "Drag", right: "", shift: "" },
};

export function CursorFollower({
  containerRef,
  connectionDragActive,
  rewireActive,
  placementActive,
  offsetX = 0,
  offsetY = 0,
  zoom = 1,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  connectionDragActive?: boolean;
  rewireActive?: boolean;
  placementActive?: boolean;
  offsetX?: number;
  offsetY?: number;
  zoom?: number;
}) {
  const hudRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const labelLeftRef = useRef<HTMLSpanElement>(null);
  const labelRightRef = useRef<HTMLSpanElement>(null);
  const labelShiftRef = useRef<HTMLSpanElement>(null);
  const iconLeftRef = useRef<SVGGElement>(null);
  const iconRightRef = useRef<SVGGElement>(null);

  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const lastCellRef = useRef<string | null>(null);
  const hoveringRef = useRef(false);

  const setLabel = useCallback((el: HTMLSpanElement | null, text: string) => {
    if (!el) return;
    if (el.textContent === text && el.getAttribute("data-empty") === (text ? "false" : "true")) return;
    el.textContent = text || "";
    el.setAttribute("data-empty", text ? "false" : "true");
  }, []);

  const setIcon = useCallback((el: SVGGElement | null, opacity: number) => {
    if (!el) return;
    el.style.opacity = String(opacity);
  }, []);

  const classify = useCallback(
    (clientX: number, clientY: number): CursorKind => {
      if (placementActive) return "placing";
      if (connectionDragActive || rewireActive) return "dragging";

      const container = containerRef.current;
      if (!container) return "canvas";

      const el = document.elementFromPoint(clientX, clientY);
      const nodeEl = el?.closest("[data-node]");
      if (nodeEl) return "node";

      return "canvas";
    },
    [containerRef, connectionDragActive, rewireActive, placementActive],
  );

  const updateHud = useCallback(
    (kind: CursorKind) => {
      const labels = LABELS[kind];
      setLabel(labelLeftRef.current, labels.left);
      setLabel(labelRightRef.current, labels.right);
      setLabel(labelShiftRef.current, labels.shift);
      setIcon(iconLeftRef.current, labels.left ? 1 : 0.18);
      setIcon(iconRightRef.current, labels.right ? 1 : 0.18);
    },
    [setLabel, setIcon],
  );

  const applyPosition = useCallback(() => {
    const c = currentRef.current;
    const t = targetRef.current;
    c.x += (t.x - c.x) * LERP;
    c.y += (t.y - c.y) * LERP;

    const hud = hudRef.current;
    if (hud) {
      hud.style.left = c.x + "px";
      hud.style.top = c.y + "px";
    }

    const dist = Math.hypot(t.x - c.x, t.y - c.y);
    if (dist > 0.25) {
      frameRef.current = requestAnimationFrame(applyPosition);
    } else {
      c.x = t.x;
      c.y = t.y;
      if (hud) {
        hud.style.left = c.x + "px";
        hud.style.top = c.y + "px";
      }
      frameRef.current = null;
    }
  }, []);

  const spawnGridPulse = useCallback(
    (stageEl: HTMLElement, screenX: number, screenY: number) => {
      // Convert screen coords to world coords
      const worldX = (screenX - offsetX) / zoom;
      const worldY = (screenY - offsetY) / zoom;
      const cellWorldX = Math.floor(worldX / GRID) * GRID;
      const cellWorldY = Math.floor(worldY / GRID) * GRID;
      const key = cellWorldX + "," + cellWorldY;
      if (key === lastCellRef.current) return;
      lastCellRef.current = key;

      // Convert world cell back to screen coords
      const screenCellX = cellWorldX * zoom + offsetX;
      const screenCellY = cellWorldY * zoom + offsetY;
      const cellSize = GRID * zoom;

      const cube = document.createElement("div");
      cube.className = "grid-pulse-cube";
      cube.style.left = screenCellX + "px";
      cube.style.top = screenCellY + "px";
      cube.style.width = cellSize + "px";
      cube.style.height = cellSize + "px";
      stageEl.appendChild(cube);
      requestAnimationFrame(() => {
        cube.style.opacity = "0";
        cube.style.transform = `scale(1.4)`;
      });
      setTimeout(() => cube.remove(), PULSE_MS);
    },
    [offsetX, offsetY, zoom],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const hud = hudRef.current;
    const dot = dotRef.current;
    if (!hud || !dot) return;

    const handlePointerEnter = () => {
      hoveringRef.current = true;
      hud.style.opacity = "1";
      dot.style.opacity = "1";
      container.classList.add("cursor-hidden");
    };

    const handlePointerLeave = () => {
      hoveringRef.current = false;
      hud.style.opacity = "0";
      dot.style.opacity = "0";
      container.classList.remove("cursor-hidden");
      lastCellRef.current = null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      dot.style.left = x + "px";
      dot.style.top = y + "px";

      targetRef.current.x = x + OFFSET_X;
      targetRef.current.y = y + OFFSET_Y;

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(applyPosition);
      }

      updateHud(classify(e.clientX, e.clientY));
      spawnGridPulse(container, x, y);
    };

    container.addEventListener("pointerenter", handlePointerEnter);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("pointermove", handlePointerMove);

    return () => {
      container.removeEventListener("pointerenter", handlePointerEnter);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("pointermove", handlePointerMove);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [containerRef, applyPosition, updateHud, classify, spawnGridPulse]);

  return (
    <>
      {/* Cursor dot indicator */}
      <div ref={dotRef} className="cursor-dot-fixed" />

      {/* HUD */}
      <div ref={hudRef} className="cursor-hud">
        {/* Left-click column */}
        <div className="col">
          <svg className="mouse-icon" viewBox="0 0 24 30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1.5c5 0 9 4 9 9v9.5a9 9 0 0 1-18 0v-9.5c0-5 4-9 9-9Z" fill="var(--surface-2, #1e1826)" />
            <g ref={iconLeftRef} style={{ opacity: 0.18, transition: "opacity .1s" }}>
              <path d="M6.2 7.1C7.5 5.3 9.4 4.4 12 4.4V11H3.2a8.8 8.8 0 0 1 3-3.9Z" fill="currentColor" stroke="none" />
            </g>
            <path d="M12 1.5c5 0 9 4 9 9v9.5a9 9 0 0 1-18 0v-9.5c0-5 4-9 9-9Z" />
            <path d="M12 2v9" />
            <path d="M3 11h18" />
          </svg>
          <span ref={labelLeftRef} className="label" data-empty="true" />
        </div>

        {/* Right-click column */}
        <div className="col">
          <svg className="mouse-icon" viewBox="0 0 24 30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1.5c5 0 9 4 9 9v9.5a9 9 0 0 1-18 0v-9.5c0-5 4-9 9-9Z" fill="var(--surface-2, #1e1826)" />
            <g ref={iconRightRef} style={{ opacity: 0.18, transition: "opacity .1s" }}>
              <path d="M17.8 7.1C16.5 5.3 14.6 4.4 12 4.4V11h8.8a8.8 8.8 0 0 0-3-3.9Z" fill="currentColor" stroke="none" />
            </g>
            <path d="M12 1.5c5 0 9 4 9 9v9.5a9 9 0 0 1-18 0v-9.5c0-5 4-9 9-9Z" />
            <path d="M12 2v9" />
            <path d="M3 11h18" />
          </svg>
          <span ref={labelRightRef} className="label" data-empty="true" />
        </div>

        {/* Shift column */}
        <div className="col">
          <span className="key">&#8679;</span>
          <span ref={labelShiftRef} className="label" data-empty="true" />
        </div>
      </div>
    </>
  );
}
