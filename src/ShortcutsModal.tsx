import { useEffect } from "react";
import "./ShortcutsModal.css";

interface ShortcutEntry {
  keys: string;
  action: string;
}

interface ShortcutGroup {
  group: string;
  shortcuts: ShortcutEntry[];
}

const groups: ShortcutGroup[] = [
  {
    group: "Session Navigation",
    shortcuts: [
      { keys: "⌘⌥ ↑", action: "Next Session" },
      { keys: "⌘⌥ ↓", action: "Previous Session" },
      { keys: "⌘⇧ ]", action: "Next Session" },
      { keys: "⌘⇧ [", action: "Previous Session" },
      { keys: "⌘W", action: "Close Session" },
    ],
  },
  {
    group: "Workspace Tabs",
    shortcuts: [
      { keys: "^ Tab", action: "Next Tab" },
      { keys: "^ ⇧ Tab", action: "Previous Tab" },
    ],
  },
  {
    group: "Session Management",
    shortcuts: [
      { keys: "⌘N", action: "New Session" },
      { keys: "⌘\\", action: "Toggle Sidebar" },
    ],
  },
  {
    group: "General",
    shortcuts: [
      { keys: "?", action: "Show keyboard shortcuts" },
      { keys: "Esc", action: "Close dialog / Cancel" },
    ],
  },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog shortcuts-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Keyboard Shortcuts</div>
        <div className="shortcuts-body">
          {groups.map((g) => (
            <div key={g.group} className="shortcuts-group">
              <div className="shortcuts-group-title">{g.group}</div>
              {g.shortcuts.map((s) => (
                <div key={s.keys + s.action} className="shortcuts-row">
                  <kbd className="shortcuts-keys">{s.keys}</kbd>
                  <span className="shortcuts-action">{s.action}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
