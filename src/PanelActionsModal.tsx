import { useState, useRef, useEffect } from "react";
import { Check, Layout } from "lucide-react";
import { Dialog } from "./components/Dialog";
import { listPanelTypes, getPanelLabel } from "./panelRegistry";
import type { PanelListItem, PanelTypeEntry } from "./panelRegistry";
import "./PanelActionsModal.css";

interface PanelActionsModalProps {
  open: boolean;
  onClose: () => void;
  currentType: string;
  onTypeSelect: (type: string) => void;
}

interface PanelTypeAction {
  type: string;
  label: string;
  isCurrent: boolean;
}

export default function PanelActionsModal({
  open,
  onClose,
  currentType,
  onTypeSelect,
}: PanelActionsModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);

  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const types: PanelListItem[] = listPanelTypes();

  const currentLabel = getPanelLabel(currentType) ?? currentType;

  const actions: PanelTypeAction[] = types
    .filter((t): t is PanelTypeEntry => t.type !== "divider")
    .map((t) => ({
      type: t.type,
      label: t.label,
      isCurrent: t.type === currentType,
    }));

  useEffect(() => {
    if (open) {
      const firstIdx = actions.findIndex((a) => !a.isCurrent);
      setActiveIndex(firstIdx >= 0 ? firstIdx : 0);
      setConfirmedKey(null);
    }
  }, [open, currentType]);

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

  function triggerAction(action: PanelTypeAction) {
    if (action.isCurrent) return;
    setConfirmedKey(action.type);
    setTimeout(() => {
      onTypeSelect(action.type);
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
          const action = actions.find((a) => a.label[0]?.toUpperCase() === upper);
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

  // Build a render list that maps each item in `types` (which may include
  // dividers) to either a divider placeholder or an action with its index.
  const renderItems: ({ kind: "divider" } | { kind: "action"; action: PanelTypeAction; actionIdx: number })[] = (() => {
    const items: ({ kind: "divider" } | { kind: "action"; action: PanelTypeAction; actionIdx: number })[] = [];
    let actionIdx = -1;
    for (const item of types) {
      if (item.type === "divider") {
        items.push({ kind: "divider" });
      } else {
        actionIdx++;
        items.push({ kind: "action", action: actions[actionIdx], actionIdx });
      }
    }
    return items;
  })();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Change panel type: ${currentLabel}`}
      className="panel-actions-dialog"
      overlayClassName="dialog-overlay--action"
      width={240}
      onKeyDown={handleKeyDown}
      header={
        <div className="panel-actions-header">
          <span className="panel-actions-context">
            <Layout size={11} className="panel-actions-context-icon" />
            Panel
          </span>
          <span className="panel-actions-name">{currentLabel}</span>
        </div>
      }
    >
      <div className="panel-actions-list" role="list">
        {renderItems.map((item, idx) => {
          if (item.kind === "divider") {
            return <div key={`divider-${idx}`} className="panel-actions-divider" />;
          }
          const { action, actionIdx } = item;
          const isActive = actionIdx === activeIndex;
          const isConfirmed = confirmedKey === action.type;
          return (
            <button
              key={action.type}
              ref={getItemRef(actionIdx)}
              className={
                "panel-actions-item" +
                (isActive ? " panel-actions-item--active" : "") +
                (isConfirmed ? " panel-actions-item--confirmed" : "")
              }
              role="listitem"
              disabled={confirmedKey !== null}
              onClick={() => triggerAction(action)}
              onMouseEnter={() => { if (!confirmedKey) setActiveIndex(actionIdx); }}
            >
              <span className="panel-actions-row-left">
                {action.isCurrent
                  ? <Check size={15} className="panel-actions-icon panel-actions-icon--current" />
                  : (isConfirmed
                    ? <Check size={15} className="panel-actions-icon panel-actions-icon--confirmed" />
                    : <div className="panel-actions-icon-spacer" />
                  )
                }
                <span className="panel-actions-label">{action.label}</span>
              </span>
              {action.isCurrent && (
                <span className="panel-actions-current-badge">active</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="panel-actions-footer">
        <kbd>↑</kbd><kbd>↓</kbd> navigate
        <span className="panel-actions-footer-sep" />
        <kbd>↵</kbd> select
        <span className="panel-actions-footer-sep" />
        <kbd>Esc</kbd> close
      </div>
    </Dialog>
  );
}
