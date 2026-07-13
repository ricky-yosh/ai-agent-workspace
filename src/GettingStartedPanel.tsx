import { useEffect, useRef } from "react";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelIdentity, usePanelFocus } from "./PanelContext";
import { Button } from "./components/ui";
import "./GettingStartedPanel.css";

const shortcuts = [
  { keys: ["⌘", "N"], label: "New session" },
  { keys: ["⌘", "T"], label: "New workspace" },
  { keys: ["⌘", "W"], label: "Close panel" },
  { keys: ["⌘", "D"], label: "Split vertical" },
  { keys: ["⌘", "⇧", "D"], label: "Split horizontal" },
  { keys: ["⌘", "'"], label: "Change panel type" },
  { keys: ["⌘", "⇧", ";"], label: "Session actions" },
  { keys: ["⌘", "⇧", "↑↓←→"], label: "Navigate panels" },
  { keys: ["⌘", "⇧", "↵"], label: "Toggle zoom" },
  { keys: ["⌘", "\\"], label: "Toggle sidebar" },
  { keys: ["⇧", "?"], label: "Show all shortcuts" },
];

function GettingStartedPanel(_props: PanelProps) {
  const { areaId } = usePanelIdentity();
  const { focusedAreaId } = usePanelFocus();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusedAreaId === areaId) {
      ref.current?.focus();
    }
  }, [focusedAreaId, areaId]);

  return (
    <div ref={ref} tabIndex={-1} className="getting-started">
      <div className="getting-started__welcome">Welcome</div>
      <div className="getting-started__subtitle">
        Get started by creating a workspace or using the keyboard shortcuts below.
      </div>

      <div className="getting-started__shortcuts">
        {shortcuts.map((s, i) => (
          <div key={i} className="getting-started__shortcut-row">
            <span className="getting-started__shortcut-keys">
              {s.keys.map((k, j) => (
                <kbd key={j} className="ui-kbd ui-kbd--sm">{k}</kbd>
              ))}
            </span>
            <span className="getting-started__shortcut-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="getting-started__divider" />

      <div className="getting-started__actions">
        <Button variant="secondary" size="md" onClick={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", {
            key: "t",
            metaKey: true,
            bubbles: true,
          }));
        }}>
          New Workspace
        </Button>
        <Button variant="secondary" size="md" onClick={() => {
          document.dispatchEvent(new KeyboardEvent("keydown", {
            key: "?",
            shiftKey: true,
            bubbles: true,
          }));
        }}>
          Show Shortcuts
        </Button>
      </div>
    </div>
  );
}

registerPanel("blank", "Getting Started", GettingStartedPanel);

export default GettingStartedPanel;
