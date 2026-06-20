import { useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { listPanelTypes, getPanelLabel } from "./panelRegistry";
import { useClickOutside } from "./hooks/useClickOutside";

interface PanelTypeSelectorProps {
  currentType: string;
  onTypeSelect: (type: string) => void;
}

export default function PanelTypeSelector({ currentType, onTypeSelect }: PanelTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const types = listPanelTypes();

  if (types.length <= 1) return null;

  const currentLabel = getPanelLabel(currentType) ?? currentType;

  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 20, padding: "4px 4px 0 4px" }}>
      <button
        onClick={() => setOpen(!open)}
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
        }}
        title={currentLabel}
      >
        {currentLabel}
        <ChevronDown size={12} />
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
