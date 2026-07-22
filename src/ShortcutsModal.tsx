import { useState, useRef, useMemo, useEffect } from "react";
import { useScrollEdges } from "./hooks/useScrollEdges";
import ScrollEdgeCue from "./components/ScrollEdgeCue";
import { replaceModifiers } from "./utils/platform";
import { Dialog } from "./components/Dialog";
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
    group: "Issue Tracker",
    shortcuts: [
      { keys: "↑ ↓", action: "Navigate issues" },
      { keys: "→", action: "Expand issue" },
      { keys: "←", action: "Collapse issue" },
      { keys: "↵", action: "Toggle expand" },
      { keys: "Home", action: "First issue" },
      { keys: "End", action: "Last issue" },
      { keys: "/", action: "Filter issues" },
      { keys: "a–z", action: "Type-ahead jump" },
      { keys: "Esc", action: "Clear filter / exit focus" },
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
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(scrollRef);

  const flatShortcuts = useMemo(() => {
    const flat: { group: string; entry: ShortcutEntry }[] = [];
    for (const g of groups) {
      for (const s of g.shortcuts) {
        flat.push({ group: g.group, entry: s });
      }
    }
    return flat;
  }, []);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    itemRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatShortcuts.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(flatShortcuts.length - 1);
        break;
    }
  }

  let flatIdx = 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      className="shortcuts-dialog"
      width={420}
      onKeyDown={handleKeyDown}
    >
      <div className="shortcuts-body-wrapper">
        <ScrollEdgeCue edge="top" visible={edges.top} />
        <div className="shortcuts-body" ref={scrollRef}>
          {groups.map((g) => (
            <div key={g.group} className="shortcuts-group">
              <div className="shortcuts-group-title">{g.group}</div>
              {g.shortcuts.map((s) => {
                const idx = flatIdx++;
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={s.keys + s.action}
                    ref={(el) => {
                      if (el) itemRefs.current.set(idx, el);
                      else itemRefs.current.delete(idx);
                    }}
                    className={`shortcuts-row${isActive ? " shortcuts-row--active" : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span className="shortcuts-keys">
                      {splitKeys(replaceModifiers(s.keys)).map((k, i) => (
                        <kbd key={i}>{k}</kbd>
                      ))}
                    </span>
                    <span className="shortcuts-action">{s.action}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <ScrollEdgeCue edge="bottom" visible={edges.bottom} />
      </div>
      <div className="shortcuts-footer">
        <kbd>↑</kbd><kbd>↓</kbd> navigate
        <span className="shortcuts-footer-sep" />
        <kbd>Esc</kbd> close
      </div>
    </Dialog>
  );
}
