import { useRef, useEffect } from "react";

interface SashContextMenuProps {
  children: React.ReactNode;
  splitPath: number[];
  onSashDoubleClick: (splitPath: number[], clientX: number, clientY: number) => void;
  joinArrow?: { direction: "vertical" | "horizontal"; consumerIndex: 0 | 1; ratio: number } | null;
}

export default function SashContextMenu({
  children,
  splitPath,
  onSashDoubleClick,
  joinArrow,
}: SashContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onSashDoubleClick) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const sash = target.closest<HTMLElement>(
        '[class*="sash"], [class*="gutter"], [class*="separator"]'
      );
      if (!sash) return;

      const owner = sash.closest("[data-split-path]");
      if (!owner) return;
      if (owner !== el) return;

      e.preventDefault();
      e.stopPropagation();
      onSashDoubleClick(splitPath, e.clientX, e.clientY);
    };

    el.addEventListener("dblclick", handler, true);
    return () => {
      el.removeEventListener("dblclick", handler, true);
    };
  }, [splitPath, onSashDoubleClick]);

  return (
    <div
      ref={ref}
      data-split-path={JSON.stringify(splitPath)}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {children}
      {joinArrow && (
        <div
          style={{
            position: "absolute",
            ...(joinArrow.direction === "vertical"
              ? { left: `${joinArrow.ratio * 100}%`, top: "50%" }
              : { top: `${joinArrow.ratio * 100}%`, left: "50%" }),
            transform: "translate(-50%, -50%)",
            zIndex: 25,
            pointerEvents: "none",
            fontSize: 28,
            color: "var(--accent-color, #7c3aed)",
            fontWeight: "bold",
            textShadow: "0 0 8px rgba(0,0,0,0.6)",
          }}
        >
          {(() => {
            if (joinArrow.direction === "vertical") {
              return joinArrow.consumerIndex === 0 ? "\u25C0" : "\u25B6";
            } else {
              return joinArrow.consumerIndex === 0 ? "\u25B2" : "\u25BC";
            }
          })()}
        </div>
      )}
    </div>
  );
}
