import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { listPanelTypes, getPanelLabel } from "./panelRegistry";
import { useClickOutside } from "./hooks/useClickOutside";
import { prefersReducedMotion } from "./screenMotion";

interface PanelTypeSelectorProps {
  currentType: string;
  onTypeSelect: (type: string) => void;
}

export default function PanelTypeSelector({ currentType, onTypeSelect }: PanelTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const types = listPanelTypes();

  if (types.length <= 1) return null;

  const currentLabel = getPanelLabel(currentType) ?? currentType;

  useClickOutside(ref, () => setOpen(false));

  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (open) {
      setDropdownVisible(false);
      const raf = requestAnimationFrame(() => setDropdownVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setDropdownVisible(false);
    }
  }, [open]);

  function handleClick() {
    setOpen((prev) => !prev);
  }

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 20, padding: "4px 4px 0 4px" }}>
      <button
        onClick={handleClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "2px 6px",
          fontSize: 11,
          background: "var(--bg-secondary, #252526)",
          color: "var(--text-primary, #e0e0e0)",
          border: "1px solid var(--border-color, #333)",
          borderRadius: 4,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transform: reducedMotion ? "scale(1)" : pressed ? "scale(0.96)" : "scale(1)",
          ...(reducedMotion ? {} : { transition: "transform 80ms cubic-bezier(0.2, 0, 0, 1)" }),
        }}
        title={currentLabel}
      >
        {currentLabel}
        <span
          style={{
            display: "inline-flex",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            ...(reducedMotion ? {} : { transition: "transform 0.2s cubic-bezier(0.2, 0, 0, 1)" }),
          }}
        >
          <ChevronDown size={12} />
        </span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 2,
            minWidth: 120,
            background: "var(--bg-secondary, #252526)",
            border: "1px solid var(--border-color, #333)",
            borderRadius: 4,
            boxShadow: "0 6px 20px rgba(0,0,0,.5)",
            zIndex: 30,
            overflow: "hidden",
            opacity: dropdownVisible ? 1 : 0,
            transform: dropdownVisible ? "translateY(0)" : "translateY(-4px)",
            ...(reducedMotion ? {} : { transition: "opacity 150ms cubic-bezier(0.2, 0, 0, 1), transform 150ms cubic-bezier(0.2, 0, 0, 1)" }),
          }}
        >
          {types.map(({ type, label }) => (
            <div
              key={type}
              onClick={() => {
                if (type !== currentType) {
                  onTypeSelect(type);
                }
                setOpen(false);
              }}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: type === currentType ? "var(--accent-color, #0078d4)" : "transparent",
                color: type === currentType ? "#fff" : "var(--text-primary, #e0e0e0)",
              }}
              onMouseEnter={(e) => { if (type !== currentType) e.currentTarget.style.background = "var(--bg-hover, #2a2a2a)"; }}
              onMouseLeave={(e) => { if (type !== currentType) e.currentTarget.style.background = "transparent"; }}
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
