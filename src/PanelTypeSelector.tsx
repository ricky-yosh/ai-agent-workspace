import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { listPanelTypes, getPanelLabel } from "./panelRegistry";
import { prefersReducedMotion } from "./screenLayout";
import PanelActionsModal from "./PanelActionsModal";

interface PanelTypeSelectorProps {
  currentType: string;
  onTypeSelect: (type: string) => void;
}

export default function PanelTypeSelector({ currentType, onTypeSelect }: PanelTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);

  const types = listPanelTypes();

  if (types.length <= 1) return null;

  const currentLabel = getPanelLabel(currentType) ?? currentType;

  const reducedMotion = prefersReducedMotion();

  return (
    <>
      <div style={{ position: "relative", zIndex: 20, padding: "4px 4px 0 4px" }}>
        <button
          onClick={() => setOpen(true)}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "2px 6px",
            fontSize: 11,
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
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
              ...(reducedMotion ? {} : { transition: "transform 0.2s cubic-bezier(0.2, 0, 0, 1)" }),
            }}
          >
            <ChevronDown size={12} />
          </span>
        </button>
      </div>
      <PanelActionsModal
        open={open}
        onClose={() => setOpen(false)}
        currentType={currentType}
        onTypeSelect={onTypeSelect}
      />
    </>
  );
}
