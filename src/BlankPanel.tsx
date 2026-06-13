import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";

function BlankPanel({ panelType }: PanelProps) {
  return (
    <div className="blank-panel">
      <span className="blank-panel-type">{panelType}</span>
      <span className="blank-panel-hint">Right-click to split this panel</span>
    </div>
  );
}

registerPanel("blank", "Blank", BlankPanel);

export default BlankPanel;
