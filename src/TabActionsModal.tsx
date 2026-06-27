import { useState, useRef, useEffect } from "react";
import { Pencil, Bookmark, RotateCcw, X, LayoutTemplate, Check } from "lucide-react";
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
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (open) {
      setMounted(true);
      setActiveIndex(0);
      setConfirmedKey(null);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    } else if (mounted) {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (visible && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [visible]);

  // Scroll active item into view
  useEffect(() => {
    itemRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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
    if (e.metaKey && e.key === "'") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
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
        onClose();
        break;
      default: {
        // Single-letter hotkeys
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

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function getItemRef(idx: number) {
    return (el: HTMLButtonElement | null) => {
      if (el) itemRefs.current.set(idx, el);
      else itemRefs.current.delete(idx);
    };
  }

  if (!mounted) return null;

  const overlayClass = `dialog-overlay dialog-overlay--action${visible ? " open" : " closing"}`;
  const dialogClass = `dialog tab-actions-dialog${visible ? " open" : " closing"}`;

  return (
    <div
      className={overlayClass}
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className={dialogClass}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tab actions: ${workspaceName}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="tab-actions-header">
          <span className="tab-actions-context">
            <LayoutTemplate size={11} className="tab-actions-context-icon" />
            Workspace
          </span>
          <span className="tab-actions-name">{workspaceName}</span>
        </div>

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
      </div>
    </div>
  );
}
