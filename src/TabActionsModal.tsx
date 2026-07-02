import { useState, useRef, useEffect } from "react";
import { Pencil, Bookmark, RotateCcw, X, LayoutTemplate, Check } from "lucide-react";
import { Dialog } from "./components/Dialog";
import "./TabActionsModal.css";

interface TabActionsModalProps {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  onRename: () => void;
  onSaveAsTemplate: () => void;
  onResetToTemplate: () => void;
  onCloseTab: () => void;
  onManageTemplates: () => void;
}

interface Action {
  key: string;
  label: string;
  handler: () => void;
  icon: React.ElementType;
}

export default function TabActionsModal({
  open,
  onClose,
  workspaceName,
  onRename,
  onSaveAsTemplate,
  onResetToTemplate,
  onCloseTab,
  onManageTemplates,
}: TabActionsModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);

  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      setConfirmedKey(null);
    }
  }, [open]);

  useEffect(() => {
    itemRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    function handleToggle(e: KeyboardEvent) {
      if (e.metaKey && e.key === "'") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleToggle);
    return () => document.removeEventListener("keydown", handleToggle);
  }, [open, onClose]);

  const actions: Action[] = [
    { key: "R", label: "Rename", handler: onRename, icon: Pencil },
    { key: "S", label: "Save as Template", handler: onSaveAsTemplate, icon: Bookmark },
    { key: "T", label: "Reset to Template", handler: onResetToTemplate, icon: RotateCcw },
    { key: "M", label: "Manage Templates", handler: onManageTemplates, icon: LayoutTemplate },
    { key: "W", label: "Close Tab", handler: onCloseTab, icon: X },
  ];

  function triggerAction(action: Action) {
    setConfirmedKey(action.key);
    setTimeout(() => {
      action.handler();
      onClose();
    }, 160);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, actions.length - 1));
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
        setActiveIndex(actions.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const a = actions[activeIndex];
        if (a) triggerAction(a);
        break;
      }
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;
      default: {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const upper = e.key.toUpperCase();
          const action = actions.find((a) => a.key === upper);
          if (action) {
            e.preventDefault();
            triggerAction(action);
          }
        }
        break;
      }
    }
  }

  function getItemRef(idx: number) {
    return (el: HTMLButtonElement | null) => {
      if (el) itemRefs.current.set(idx, el);
      else itemRefs.current.delete(idx);
    };
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Tab actions: ${workspaceName}`}
      className="tab-actions-dialog"
      overlayClassName="dialog-overlay--action"
      width={280}
      onKeyDown={handleKeyDown}
      header={
        <div className="tab-actions-header">
          <span className="tab-actions-context">
            <LayoutTemplate size={11} className="tab-actions-context-icon" />
            Workspace
          </span>
          <span className="tab-actions-name">{workspaceName}</span>
        </div>
      }
    >
      <div className="tab-actions-list" role="list">
        {actions.map((action, idx) => {
          const Icon = action.icon;
          const isActive = idx === activeIndex;
          const isConfirmed = confirmedKey === action.key;
          return (
            <button
              key={action.key}
              ref={getItemRef(idx)}
              className={`tab-actions-item${isActive ? " tab-actions-item--active" : ""}${isConfirmed ? " tab-actions-item--confirmed" : ""}`}
              role="listitem"
              disabled={confirmedKey !== null}
              onClick={() => triggerAction(action)}
              onMouseEnter={() => { if (!confirmedKey) setActiveIndex(idx); }}
            >
              <span className="tab-actions-row-left">
                {isConfirmed
                  ? <Check size={15} className="tab-actions-icon tab-actions-icon--confirmed" />
                  : <Icon size={15} className="tab-actions-icon" />
                }
                <span className="tab-actions-label">{action.label}</span>
              </span>
              <kbd className="tab-actions-kbd">{action.key}</kbd>
            </button>
          );
        })}
      </div>

      <div className="tab-actions-footer">
        <kbd>↑</kbd><kbd>↓</kbd> navigate
        <span className="tab-actions-footer-sep" />
        <kbd>↵</kbd> select
        <span className="tab-actions-footer-sep" />
        <kbd>Esc</kbd> close
      </div>
    </Dialog>
  );
}
