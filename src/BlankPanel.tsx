import { useEffect, useRef } from "react";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelContext } from "./PanelContext";

function BlankPanel({ panelType }: PanelProps) {
  const { focusedAreaId, areaId } = usePanelContext();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusedAreaId === areaId) {
      ref.current?.focus();
    }
  }, [focusedAreaId, areaId]);

  return (
    <div ref={ref} className="blank-panel" tabIndex={-1}>
      <span className="blank-panel-type">{panelType}</span>
      <span className="blank-panel-hint">Right-click to split this panel</span>
    </div>
  );
}

registerPanel("blank", "Blank", BlankPanel);

export default BlankPanel;
