import React, { useState, useRef, useEffect } from "react";
import {
  Folder,
  FileCode2,
  GitCompare,
  Terminal,
  Hash,
  Clipboard,
  Check,
  Pencil,
  Trash2,
} from "lucide-react";
import type { SessionSummary } from "./SessionContext";
import { Dialog } from "./components/Dialog";
import "./SessionActionsModal.css";

interface SessionActionsModalProps {
  open: boolean;
  onClose: () => void;
  session: SessionSummary | null;
  onOpenInFinder: () => void;
  onOpenInEditor: () => void;
  onOpenInDiff: () => void;
  onOpenInTerminal: () => void;
  onCopyId: () => void;
  onCopyPath: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

interface Action {
  key: string;
  matchKey?: string;
  label: string;
  handler: () => void;
  icon: React.ElementType;
  destructive?: boolean;
  immediate?: boolean;
}

export default function SessionActionsModal({
  open,
  onClose,
  session,
  onOpenInFinder,
  onOpenInEditor,
  onOpenInDiff,
  onOpenInTerminal,
  onCopyId,
  onCopyPath,
  onRename,
  onDelete,
}: SessionActionsModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const renameInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      setConfirmedKey(null);
      setRenaming(false);
      setRenameValue("");
    }
  }, [open]);

  useEffect(() => {
    itemRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const openActions: Action[] = [
    { key: "F", label: "Open in Finder", handler: onOpenInFinder, icon: Folder },
    { key: "E", label: "Open in Editor", handler: onOpenInEditor, icon: FileCode2 },
    { key: "D", label: "Open in External Diff", handler: onOpenInDiff, icon: GitCompare },
    { key: "T", label: "Open in Terminal", handler: onOpenInTerminal, icon: Terminal },
  ];

  const infoActions: Action[] = [
    { key: "I", label: "Copy Session ID", handler: onCopyId, icon: Hash },
    { key: "P", label: "Copy Session Path", handler: onCopyPath, icon: Clipboard },
    { key: "R", label: "Rename", handler: () => { setRenaming(true); setRenameValue(session?.name ?? ""); }, icon: Pencil, immediate: true },
    { key: "⌫", matchKey: "Backspace", label: "Delete Session", handler: onDelete, icon: Trash2, destructive: true },
  ];

  const actions: Action[] = [...openActions, ...infoActions];

  function triggerAction(action: Action) {
    if (action.immediate) {
      action.handler();
      return;
    }
    setConfirmedKey(action.key);
    setTimeout(() => {
      action.handler();
      onClose();
    }, 160);
  }

  function submitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session?.name) onRename(trimmed);
    onClose();
  }

  function cancelRename() {
    setRenaming(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (renaming) return;
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
      case "Backspace":
      case "Delete": {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const action = actions.find((a) => a.matchKey === "Backspace");
          if (action) { e.preventDefault(); triggerAction(action); }
        }
        break;
      }
      default: {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const upper = e.key.toUpperCase();
          const action = actions.find((a) => a.key === upper && !a.matchKey);
          if (action) { e.preventDefault(); triggerAction(action); }
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
      title={`Session actions: ${session?.name ?? ""}`}
      className="session-actions-dialog"
      overlayClassName="dialog-overlay--action"
      width={460}
      onKeyDown={handleKeyDown}
      header={
        <div className="session-actions-header">
          <span className="session-actions-context">
            <Terminal size={11} className="session-actions-context-icon" />
            Session
          </span>
          {renaming ? (
            <input
              ref={renameInputRef}
              className="session-actions-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") cancelRename();
              }}
              onBlur={submitRename}
            />
          ) : (
            <span className="session-actions-name">{session?.name ?? ""}</span>
          )}
        </div>
      }
    >
      <div className="session-actions-columns">
        <div className="session-actions-column" role="list" aria-label="Open with">
          <div className="session-actions-column-header">Open With</div>
          {openActions.map((action, colIdx) => {
            const idx = colIdx;
            const Icon = action.icon;
            const isActive = idx === activeIndex;
            const isConfirmed = confirmedKey === action.key;
            return (
              <button
                key={action.key}
                ref={getItemRef(idx)}
                className={`session-actions-item${isActive ? " session-actions-item--active" : ""}${isConfirmed ? " session-actions-item--confirmed" : ""}`}
                role="listitem"
                disabled={confirmedKey !== null || renaming}
                onClick={() => triggerAction(action)}
                onMouseEnter={() => { if (!confirmedKey && !renaming) setActiveIndex(idx); }}
              >
                <span className="session-actions-row-left">
                  {isConfirmed
                    ? <Check size={15} className="session-actions-icon session-actions-icon--confirmed" />
                    : <Icon size={15} className="session-actions-icon" />
                  }
                  <span className="session-actions-label">{action.label}</span>
                </span>
                <kbd className="session-actions-kbd">{action.key}</kbd>
              </button>
            );
          })}
        </div>
        <div className="session-actions-column" role="list" aria-label="Info and manage">
          <div className="session-actions-column-header">Info &amp; Manage</div>
          {infoActions.map((action, colIdx) => {
            const idx = openActions.length + colIdx;
            const Icon = action.icon;
            const isActive = idx === activeIndex;
            const isConfirmed = confirmedKey === action.key;
            return (
              <button
                key={action.key}
                ref={getItemRef(idx)}
                className={`session-actions-item${isActive ? " session-actions-item--active" : ""}${isConfirmed ? " session-actions-item--confirmed" : ""}${action.destructive ? " session-actions-item--destructive" : ""}`}
                role="listitem"
                disabled={confirmedKey !== null || renaming}
                onClick={() => triggerAction(action)}
                onMouseEnter={() => { if (!confirmedKey && !renaming) setActiveIndex(idx); }}
              >
                <span className="session-actions-row-left">
                  {isConfirmed
                    ? <Check size={15} className="session-actions-icon session-actions-icon--confirmed" />
                    : <Icon size={15} className="session-actions-icon" />
                  }
                  <span className="session-actions-label">{action.label}</span>
                </span>
                <kbd className="session-actions-kbd">{action.key}</kbd>
              </button>
            );
          })}
        </div>
      </div>

      <div className="session-actions-footer">
        <kbd>↑</kbd><kbd>↓</kbd> navigate
        <span className="session-actions-footer-sep" />
        <kbd>↵</kbd> select
        <span className="session-actions-footer-sep" />
        <kbd>Esc</kbd> close
      </div>
    </Dialog>
  );
}
