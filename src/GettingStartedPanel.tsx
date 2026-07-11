import { useEffect, useRef } from "react";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelIdentity, usePanelFocus } from "./PanelContext";
import { Button } from "./components/ui";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "32px 24px",
    overflow: "auto",
    boxSizing: "border-box" as const,
    gap: 0,
  },
  welcome: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 4,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 24,
    lineHeight: "20px",
    textAlign: "center" as const,
  },
  shortcutsSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    width: "100%",
    maxWidth: 380,
  },
  shortcutRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 10px",
    borderRadius: 6,
    fontSize: 12,
    color: "var(--text-primary)",
    lineHeight: "20px",
  },
  shortcutKeys: {
    display: "flex",
    alignItems: "center",
    gap: 3,
  },
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 18,
    height: 18,
    padding: "0 4px",
    fontFamily: "inherit",
    fontSize: 10,
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(255, 255, 255, 0.10)",
    borderRadius: 3,
    color: "var(--text-dim, #888)",
  },
  shortcutLabel: {
    color: "var(--text-muted)",
    fontSize: 12,
  },
  divider: {
    height: 1,
    background: "rgba(255, 255, 255, 0.06)",
    margin: "3px 10px",
  },
  actionsRow: {
    display: "flex",
    gap: 8,
    marginTop: 20,
  },
  actionBtn: {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-primary)",
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(255, 255, 255, 0.10)",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: "18px",
  },
} as const;

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
    <div ref={ref} tabIndex={-1} style={styles.container}>
      <div style={styles.welcome}>Welcome</div>
      <div style={styles.subtitle}>
        Get started by creating a workspace or using the keyboard shortcuts below.
      </div>

      <div style={styles.shortcutsSection}>
        {shortcuts.map((s, i) => (
          <div key={i} style={styles.shortcutRow}>
            <span style={styles.shortcutKeys}>
              {s.keys.map((k, j) => (
                <kbd key={j} style={styles.kbd}>{k}</kbd>
              ))}
            </span>
            <span style={styles.shortcutLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={styles.divider} />

      <div style={styles.actionsRow}>
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
