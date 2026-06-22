import { useEffect, useState } from "react";
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
  {
    group: "Panels",
    shortcuts: [
      { keys: "⌘⇧↵", action: "Zoom focused panel" },
    ],
  },
];

export default function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    } else if (mounted) {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`dialog-overlay${visible ? " open" : " closing"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`dialog shortcuts-dialog${visible ? " open" : " closing"}`} onClick={(e) => e.stopPropagation()}>
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
