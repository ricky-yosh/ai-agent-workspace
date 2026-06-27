import { useEffect, useState } from "react";
import "./ShortcutsModal.css";

interface ShortcutEntry {
  keys: string;
  action: string;
}

function splitKeys(keys: string): string[] {
  const parts: string[] = [];
  for (const segment of keys.split(" ")) {
    let i = 0;
    while (i < segment.length && "⌘⌥⇧^".includes(segment[i])) {
      parts.push(segment[i]);
      i++;
    }
    if (i < segment.length) {
      parts.push(segment.slice(i));
    }
  }
  return parts;
}

interface ShortcutGroup {
  group: string;
  shortcuts: ShortcutEntry[];
}

const groups: ShortcutGroup[] = [
  {
    group: "Session Navigation",
    shortcuts: [
      { keys: "⌘⇧ ]", action: "Next Session" },
      { keys: "⌘⇧ [", action: "Previous Session" },
    ],
  },
  {
    group: "Workspace Tabs",
    shortcuts: [
      { keys: "⌘T", action: "New Workspace" },
      { keys: "⌘'", action: "Tab actions" },
      { keys: "^ Tab", action: "Next Tab" },
      { keys: "^ ⇧ Tab", action: "Previous Tab" },
    ],
  },
  {
    group: "Panel Navigation",
    shortcuts: [
      { keys: "⌘⇧ ↑", action: "Focus panel above" },
      { keys: "⌘⇧ ↓", action: "Focus panel below" },
      { keys: "⌘⇧ ←", action: "Focus panel left" },
      { keys: "⌘⇧ →", action: "Focus panel right" },
    ],
  },
  {
    group: "Panel Actions",
    shortcuts: [
      { keys: "⌘W", action: "Close focused panel" },
      { keys: "⌘D", action: "Split panel vertically" },
      { keys: "⌘⇧ D", action: "Split panel horizontally" },
      { keys: "⌘⇧↵", action: "Zoom focused panel" },
    ],
  },
  {
    group: "Session Management",
    shortcuts: [
      { keys: "⌘N", action: "New Session" },
      { keys: "⌘;", action: "Session actions" },
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
                  <span className="shortcuts-keys">
                    {splitKeys(s.keys).map((k, i) => (
                      <kbd key={i}>{k}</kbd>
                    ))}
                  </span>
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
