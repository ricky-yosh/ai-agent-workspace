import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Dialog } from "../Dialog";
import { MenuItem } from "./MenuItem";
import { Button } from "./Button";
import "./ActionModal.css";

export interface ActionModalAction {
  label: string;
  icon?: ReactNode;
  /** Single keyboard character, e.g. "r" for rename, "d" for delete */
  shortcut: string;
  destructive?: boolean;
  /** Shown before executing a destructive action */
  confirmMessage?: string;
  /**
   * Called when the action is confirmed.
   * For sub-page actions (rename), draftValue contains the edited value.
   * For destructive/confirm actions, draftValue is undefined.
   */
  onConfirm: (draftValue?: string) => void | Promise<void>;
  /**
   * If provided, selecting this action shows the sub-page editor
   * instead of immediately confirming.
   */
  renderSubPage?: (helpers: {
    value: string;
    onChange: (v: string) => void;
    onSave: () => void;
    onBack: () => void;
  }) => ReactNode;
}

export interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  actions: ActionModalAction[];
  /** Initial value for the draft when entering a sub-page action */
  initialDraftValue?: string;
}

type View = "list" | "sub-page" | "confirm";

export function ActionModal({
  open,
  onClose,
  title,
  actions,
  initialDraftValue = "",
}: ActionModalProps) {
  const [view, setView] = useState<View>("list");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [draftValue, setDraftValue] = useState(initialDraftValue);
  const [pendingActionIdx, setPendingActionIdx] = useState<number | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setView("list");
      setFocusedIndex(0);
      setDraftValue(initialDraftValue);
      setPendingActionIdx(null);
    }
  }, [open, initialDraftValue]);

  const selectedAction =
    pendingActionIdx !== null ? actions[pendingActionIdx] : null;

  const returnToList = useCallback(() => {
    setView("list");
    if (pendingActionIdx !== null) {
      setFocusedIndex(pendingActionIdx);
    }
  }, [pendingActionIdx]);

  const handleExecuteAction = useCallback(
    (idx: number) => {
      const action = actions[idx];
      if (action.renderSubPage) {
        setPendingActionIdx(idx);
        setDraftValue(initialDraftValue);
        setView("sub-page");
      } else if (action.destructive && action.confirmMessage) {
        setPendingActionIdx(idx);
        setView("confirm");
      } else {
        // Non-destructive, no sub-page: execute directly
        action.onConfirm();
        onClose();
      }
    },
    [actions, initialDraftValue, onClose],
  );

  const handleSubPageSave = useCallback(() => {
    if (selectedAction) {
      selectedAction.onConfirm(draftValue);
      onClose();
    }
  }, [selectedAction, draftValue, onClose]);

  const handleConfirmAction = useCallback(() => {
    if (selectedAction) {
      selectedAction.onConfirm();
      onClose();
    }
  }, [selectedAction, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (view === "sub-page") {
        // Escape returns to list; let child handle Enter and other keys
        if (e.key === "Escape") {
          e.preventDefault();
          returnToList();
          return;
        }
        return;
      }

      if (view === "confirm") {
        if (e.key === "Escape") {
          e.preventDefault();
          returnToList();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          handleConfirmAction();
          return;
        }
        return;
      }

      // List view
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, actions.length - 1));
          return;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          return;
        case "Enter":
          e.preventDefault();
          handleExecuteAction(focusedIndex);
          return;
        case "Escape":
          e.preventDefault();
          onClose();
          return;
        default:
          // Shortcut letter navigation
          if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
            const upper = e.key.toUpperCase();
            const idx = actions.findIndex(
              (a) => a.shortcut.toUpperCase() === upper,
            );
            if (idx !== -1) {
              e.preventDefault();
              setFocusedIndex(idx);
              handleExecuteAction(idx);
              return;
            }
          }
      }
    },
    [view, focusedIndex, actions, handleExecuteAction, handleConfirmAction, onClose, returnToList],
  );

  const headerNode = (
    <div className="action-modal__header">
      {view !== "list" ? (
        <button className="action-modal__back" onClick={returnToList}>
          ← Back
        </button>
      ) : (
        <div className="dialog-title">{title}</div>
      )}
      <button className="dialog-close-btn" onClick={onClose}>✕</button>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={undefined}
      header={headerNode}
      onKeyDown={handleKeyDown}
      width={440}
      overlayClassName="dialog-overlay--action"
    >
      {view === "list" && (
        <div className="action-modal__list">
          {actions.map((action, idx) => (
            <MenuItem
              key={idx}
              active={idx === focusedIndex}
              label={action.label}
              leading={action.icon}
              destructive={action.destructive}
              trailing={
                <kbd className="action-modal__shortcut">
                  {action.shortcut}
                </kbd>
              }
              onMouseEnter={() => setFocusedIndex(idx)}
              onClick={() => {
                setFocusedIndex(idx);
                handleExecuteAction(idx);
              }}
            />
          ))}
        </div>
      )}

      {view === "sub-page" && selectedAction?.renderSubPage && (
        <div className="action-modal__sub-page">
          {selectedAction.renderSubPage({
            value: draftValue,
            onChange: setDraftValue,
            onSave: handleSubPageSave,
            onBack: returnToList,
          })}
        </div>
      )}

      {view === "confirm" && selectedAction && (
        <div className="action-modal__confirm">
          <p className="action-modal__confirm-message">
            {selectedAction.confirmMessage}
          </p>
          <div className="action-modal__confirm-actions">
            <Button variant="ghost" onClick={returnToList}>
              Cancel
            </Button>
            <Button
              variant={selectedAction.destructive ? "danger" : "primary"}
              onClick={handleConfirmAction}
            >
              {selectedAction.label}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
