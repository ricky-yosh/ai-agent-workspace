import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  ArrowUpDown,
  Copy,
  Pencil,
  Trash2,
  X,
  Check,
  LayoutTemplate,
} from "lucide-react";
import type { Layout } from "./SplitLayout";
import "./ManageTemplatesModal.css";

interface ManageTemplatesModalProps {
  templates: Layout[];
  onRenameTemplate: (id: string, newName: string) => void;
  onDeleteTemplate: (id: string) => void;
  onClose: () => void;
  onDuplicateTemplate?: (id: string) => void;
  workspaceCounts?: Record<string, number>;
}

type SortOrder = "asc" | "desc";

const FOCUSABLE = [
  "input",
  "button",
  "textarea",
  "select",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function ManageTemplatesModal({
  templates,
  onRenameTemplate,
  onDeleteTemplate,
  onClose,
  onDuplicateTemplate,
  workspaceCounts,
}: ManageTemplatesModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const editingInputRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let result = q
      ? templates.filter((t) => t.name.toLowerCase().includes(q))
      : [...templates];
    result.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return result;
  }, [templates, searchQuery, sortOrder]);

  const activeTemplate = filteredTemplates[activeIndex] ?? null;

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (editingId && editingInputRef.current) {
      editingInputRef.current.focus();
      editingInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (activeIndex >= filteredTemplates.length) {
      setActiveIndex(Math.max(0, filteredTemplates.length - 1));
    }
  }, [filteredTemplates.length, activeIndex]);

  const scrollIntoView = useCallback((idx: number) => {
    const el = itemRefs.current.get(idx);
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  // Moves both the "active" highlight and actual DOM focus together — if focus
  // doesn't follow, the highlighted row and the focused row drift apart (the
  // highlight shows where arrow keys think you are, the ring shows where the
  // browser thinks you are), which looks like two different rows are selected.
  const moveActive = useCallback(
    (idx: number) => {
      setActiveIndex(idx);
      scrollIntoView(idx);
      itemRefs.current.get(idx)?.focus();
    },
    [scrollIntoView]
  );

  // When rename/delete-confirm controls unmount, focus falls back to <body>,
  // which is outside the list's onKeyDown subtree — arrow keys silently stop
  // working until focus lands back on a row or the search box. Reclaim it.
  const wasEditingOrConfirming = useRef(false);
  useEffect(() => {
    const isEditingOrConfirming = editingId !== null || confirmingDeleteId !== null;
    if (wasEditingOrConfirming.current && !isEditingOrConfirming) {
      itemRefs.current.get(activeIndex)?.focus();
    }
    wasEditingOrConfirming.current = isEditingOrConfirming;
  }, [editingId, confirmingDeleteId, activeIndex]);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRenameTemplate(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, onRenameTemplate]);

  const startRename = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
    setConfirmingDeleteId(null);
  }, []);

  const startDelete = useCallback((id: string) => {
    setConfirmingDeleteId((prev) => (prev === id ? null : id));
    setEditingId(null);
  }, []);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function toggleSort() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  function getItemRef(idx: number) {
    return (el: HTMLDivElement | null) => {
      if (el) itemRefs.current.set(idx, el);
      else itemRefs.current.delete(idx);
    };
  }

  function focusActiveItem() {
    const el = itemRefs.current.get(activeIndex);
    el?.focus();
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (editingId || confirmingDeleteId) return;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        moveActive(Math.min(activeIndex + 1, filteredTemplates.length - 1));
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        moveActive(Math.max(activeIndex - 1, 0));
        break;
      }
      case "Home": {
        e.preventDefault();
        moveActive(0);
        break;
      }
      case "End": {
        e.preventDefault();
        moveActive(filteredTemplates.length - 1);
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (activeTemplate) {
          startRename(activeTemplate.id, activeTemplate.name);
        }
        break;
      }
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        if (activeTemplate) {
          startDelete(activeTemplate.id);
        }
        break;
      }
      case "f": {
        if (!e.ctrlKey && !e.metaKey) break;
        e.preventDefault();
        searchInputRef.current?.focus();
        break;
      }
    }
  }

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (editingId) {
        e.stopPropagation();
        setEditingId(null);
        return;
      }
      if (confirmingDeleteId) {
        e.stopPropagation();
        setConfirmingDeleteId(null);
        return;
      }
      onClose();
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusActiveItem();
    }
    if (e.key === "Escape") {
      if (searchQuery) {
        e.stopPropagation();
        setSearchQuery("");
      }
    }
  }

  function getFocusableElements(): HTMLElement[] {
    if (!dialogRef.current) return [];
    const all = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    return Array.from(all).filter((el) => el.offsetParent !== null);
  }

  function handleTabWrap(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div
      className="dialog-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="dialog template-manager-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Manage Layout Templates"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="dialog-title-row">
          <div className="dialog-title">Manage Layout Templates</div>
          <button
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="template-search">
          <span className="template-search-icon" aria-hidden="true">
            <Search size={14} />
          </span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search templates…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            aria-label="Search templates"
          />
        </div>

        <div className="template-list-header">
          <span className="template-list-count">
            {filteredTemplates.length === templates.length
              ? `${templates.length} template${templates.length !== 1 ? "s" : ""}`
              : `${filteredTemplates.length} of ${templates.length} template${templates.length !== 1 ? "s" : ""}`}
          </span>
          <button
            className="template-sort-btn"
            onClick={toggleSort}
            aria-label={`Sort ${sortOrder === "asc" ? "descending" : "ascending"}`}
            title={`Sort ${sortOrder === "asc" ? "Z–A" : "A–Z"}`}
          >
            <ArrowUpDown size={12} />
            {sortOrder === "asc" ? "A–Z" : "Z–A"}
          </button>
        </div>

        <div
          className="template-list"
          ref={listRef}
          role="listbox"
          aria-label="Template list"
          onKeyDown={handleListKeyDown}
          onKeyUp={handleTabWrap}
        >
          {filteredTemplates.length === 0 && searchQuery.trim() && (
            <div className="template-search-empty">
              <span>No templates match "{searchQuery.trim()}"</span>
            </div>
          )}

          {filteredTemplates.length === 0 && !searchQuery.trim() && (
            <div className="template-empty">
              <span className="template-empty-icon" aria-hidden="true">
                <LayoutTemplate size={32} strokeWidth={1.5} />
              </span>
              <span className="template-empty-text">No templates saved</span>
              <span className="template-empty-hint">
                Save a layout from the tab context menu
              </span>
            </div>
          )}

          {filteredTemplates.map((t, idx) => {
            const isActive = idx === activeIndex;
            const isEditing = editingId === t.id;
            const isConfirmingDelete = confirmingDeleteId === t.id;
            const usageCount = workspaceCounts?.[t.id] ?? 0;
            const showActions = !isEditing && !isConfirmingDelete;

            return (
              <div
                key={t.id}
                className="template-item"
                role="option"
                aria-selected={isActive}
                aria-label={`Template: ${t.name}${usageCount > 0 ? `, used by ${usageCount} workspace${usageCount !== 1 ? "s" : ""}` : ""}`}
              >
                <div
                  className={`template-item-row${isActive ? " template-item-active" : ""}`}
                  ref={getItemRef(idx)}
                  tabIndex={isActive ? 0 : -1}
                  onClick={(e) => {
                    setActiveIndex(idx);
                    e.currentTarget.focus();
                  }}
                  onDoubleClick={() => startRename(t.id, t.name)}
                  onFocus={() => setActiveIndex(idx)}
                >
                  {isEditing ? (
                    <div className="template-rename-wrapper">
                      <input
                        ref={editingInputRef}
                        className="template-rename-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Rename template"
                      />
                      <button
                        className="template-rename-confirm"
                        onClick={(e) => {
                          e.stopPropagation();
                          commitRename();
                        }}
                        aria-label="Confirm rename"
                        title="Confirm"
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <span className="template-item-name" title={t.name}>
                      {t.name}
                    </span>
                  )}

                  {usageCount > 0 && !isEditing && (
                    <span
                      className="template-in-use-badge"
                      title={`Used by ${usageCount} workspace${usageCount !== 1 ? "s" : ""}`}
                    >
                      {usageCount} workspace{usageCount !== 1 ? "s" : ""}
                    </span>
                  )}

                  {showActions && (
                    <div className="template-item-actions">
                      {onDuplicateTemplate && (
                        <button
                          className="template-item-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateTemplate(t.id);
                          }}
                          aria-label={`Duplicate ${t.name}`}
                          title="Duplicate"
                        >
                          <Copy size={13} />
                        </button>
                      )}
                      <button
                        className="template-item-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(t.id, t.name);
                        }}
                        aria-label={`Rename ${t.name}`}
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="template-item-btn template-item-btn-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          startDelete(t.id);
                        }}
                        aria-label={`Delete ${t.name}`}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {isConfirmingDelete && (
                  <div
                    className="template-confirm-delete"
                    onClick={(e) => e.stopPropagation()}
                    role="group"
                    aria-label="Confirm delete"
                  >
                    <span className="template-confirm-delete-text">
                      Remove "{t.name}"?
                    </span>
                    <button
                      className="template-confirm-delete-btn template-confirm-delete-btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTemplate(t.id);
                        setConfirmingDeleteId(null);
                      }}
                      autoFocus
                      aria-label="Confirm deletion"
                    >
                      Delete
                    </button>
                    <button
                      className="template-confirm-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingDeleteId(null);
                      }}
                      aria-label="Cancel deletion"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="template-footer">
          <span>
            <kbd>&uarr;</kbd> <kbd>&darr;</kbd> navigate&ensp;
            <kbd>&crarr;</kbd> rename&ensp;
            <kbd>&#9003;</kbd> delete&ensp;
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
