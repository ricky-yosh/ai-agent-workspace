import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./components/ui";
import { listPanelTypes, getPanelLabel } from "./panelRegistry";
import { prefersReducedMotion } from "./screenLayout";
import PanelActionsModal from "./PanelActionsModal";

interface PanelTypeSelectorProps {
  currentType: string;
  onTypeSelect: (type: string) => void;
}

export default function PanelTypeSelector({ currentType, onTypeSelect }: PanelTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const types = listPanelTypes();

  if (types.length <= 1) return null;

  const currentLabel = getPanelLabel(currentType) ?? currentType;

  const reducedMotion = prefersReducedMotion();

  return (
    <>
      <div style={{ position: "relative", zIndex: 20, padding: "4px 4px 0 4px" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          title={currentLabel}
          style={{ whiteSpace: "nowrap" }}
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
        </Button>
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
