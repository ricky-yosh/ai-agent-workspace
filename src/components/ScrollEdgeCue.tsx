import "./ScrollEdgeCue.css";

interface ScrollEdgeCueProps {
  edge: "top" | "bottom" | "left" | "right";
  visible: boolean;
  chevron?: boolean;
}

export default function ScrollEdgeCue({ edge, visible, chevron = true }: ScrollEdgeCueProps) {
  if (!visible) return null;

  const isVertical = edge === "top" || edge === "bottom";
  const className = [
    "scroll-edge-cue",
    `scroll-edge-cue--${edge}`,
    isVertical ? "scroll-edge-cue--vertical" : "scroll-edge-cue--horizontal",
  ].join(" ");

  return (
    <div className={className} aria-hidden="true">
      {chevron && (
        <svg
          className="scroll-edge-cue-chevron"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          {edge === "bottom" && (
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {edge === "top" && (
            <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {edge === "left" && (
            <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {edge === "right" && (
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      )}
    </div>
  );
}
