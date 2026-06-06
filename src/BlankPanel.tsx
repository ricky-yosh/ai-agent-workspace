import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";

function BlankPanel({ panelType }: PanelProps) {
  return (
    <div className="blank-panel">
      {panelType}
    </div>
  );
}

registerPanel("blank", BlankPanel);

export default BlankPanel;
