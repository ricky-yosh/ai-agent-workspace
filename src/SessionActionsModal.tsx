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
  matchKey?: string;   // e.key value for non-letter keys
  label: string;
  handler: () => void;
  icon: React.ElementType;
  destructive?: boolean;
  immediate?: boolean; // skip checkmark flash, call handler directly
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
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
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
      setMounted(true);
      setActiveIndex(0);
      setConfirmedKey(null);
      setRenaming(false);
      setRenameValue("");
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
    { key: "F", label: "Open in Finder", handler: onOpenInFinder, icon: Folder },
    { key: "E", label: "Open in Editor", handler: onOpenInEditor, icon: FileCode2 },
    { key: "D", label: "Open in External Diff", handler: onOpenInDiff, icon: GitCompare },
    { key: "T", label: "Open in Terminal", handler: onOpenInTerminal, icon: Terminal },
    { key: "I", label: "Copy Session ID", handler: onCopyId, icon: Hash },
    { key: "P", label: "Copy Session Path", handler: onCopyPath, icon: Clipboard },
    { key: "R", label: "Rename", handler: () => { setRenaming(true); setRenameValue(session?.name ?? ""); }, icon: Pencil, immediate: true },
    { key: "⌫", matchKey: "Backspace", label: "Delete Session", handler: onDelete, icon: Trash2, destructive: true },
  ];

  const dividerAfterIndex = 5; // divider between tool actions and session management

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
    dialogRef.current?.focus();
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
  const dialogClass = `dialog session-actions-dialog${visible ? " open" : " closing"}`;

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
        aria-label={`Session actions: ${session?.name ?? ""}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
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

        <div className="session-actions-list" role="list">
          {actions.map((action, idx) => {
            const Icon = action.icon;
            const isActive = idx === activeIndex;
            const isConfirmed = confirmedKey === action.key;
            return (
              <React.Fragment key={action.key}>
                {idx === dividerAfterIndex + 1 && (
                  <div className="session-actions-divider" role="separator" />
                )}
                <button
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
              </React.Fragment>
            );
          })}
        </div>

        <div className="session-actions-footer">
          <kbd>↑</kbd><kbd>↓</kbd> navigate
          <span className="session-actions-footer-sep" />
          <kbd>↵</kbd> select
          <span className="session-actions-footer-sep" />
          <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  );
}
