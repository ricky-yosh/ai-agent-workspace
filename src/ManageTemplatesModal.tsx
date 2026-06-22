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
import type { Layout } from "./types/screen";
import "./ManageTemplatesModal.css";

interface ManageTemplatesModalProps {
  open: boolean;
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

function useFocusTrap(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const all = el.querySelectorAll<HTMLElement>(FOCUSABLE);
    const focusable = Array.from(all).filter((e) => e.offsetParent !== null);
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const all = Array.from(el!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (e) => e.offsetParent !== null
      );
      if (all.length === 0) return;
      const first = all[0];
      const last = all[all.length - 1];

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

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ref]);
}

function useReclaimFocus(returnElement?: HTMLElement | null) {
  const previousRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousRef.current = document.activeElement as HTMLElement;
    return () => {
      (returnElement ?? previousRef.current)?.focus();
    };
  }, [returnElement]);
}

function useTemplateKeyboardNavigation(
  filteredTemplates: Layout[],
  activeIndex: number,
  setActiveIndex: (idx: number) => void,
  editingId: string | null,
  confirmingDeleteId: string | null,
  setConfirmingDeleteId: (id: string | null) => void,
  onRename: () => void,
  onDelete: () => void,
  onDeleteConfirm: () => void,
  focusSearch: () => void
) {
  const stateRef = useRef({
    filteredTemplates,
    activeIndex,
    setActiveIndex,
    editingId,
    confirmingDeleteId,
    setConfirmingDeleteId,
    onRename,
    onDelete,
    onDeleteConfirm,
    focusSearch,
  });

  useEffect(() => {
    stateRef.current = {
      filteredTemplates,
      activeIndex,
      setActiveIndex,
      editingId,
      confirmingDeleteId,
      setConfirmingDeleteId,
      onRename,
      onDelete,
      onDeleteConfirm,
      focusSearch,
    };
  });

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const s = stateRef.current;
    if (s.editingId) return;

    if (
      s.confirmingDeleteId &&
      e.key !== "Delete" &&
      e.key !== "Backspace" &&
      e.key !== "Escape"
    ) {
      s.setConfirmingDeleteId(null);
    }

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        s.setActiveIndex(Math.min(s.activeIndex + 1, s.filteredTemplates.length - 1));
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        s.setActiveIndex(Math.max(s.activeIndex - 1, 0));
        break;
      }
      case "Home": {
        e.preventDefault();
        s.setActiveIndex(0);
        break;
      }
      case "End": {
        e.preventDefault();
        s.setActiveIndex(s.filteredTemplates.length - 1);
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (s.filteredTemplates[s.activeIndex]) {
          s.onRename();
        }
        break;
      }
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        const active = s.filteredTemplates[s.activeIndex];
        if (active) {
          if (s.confirmingDeleteId === active.id) {
            s.onDeleteConfirm();
          } else {
            s.onDelete();
          }
        }
        break;
      }
      case "f": {
        if (!e.ctrlKey && !e.metaKey) break;
        e.preventDefault();
        s.focusSearch();
        break;
      }
    }
  }, []);

  return onKeyDown;
}

interface TemplateRowProps {
  template: Layout;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  editingName: string;
  onSelect: (idx: number) => void;
  onEditStart: (id: string, name: string) => void;
  onEditNameChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onDeleteStart: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
  usageCount: number;
  onDuplicate?: (id: string) => void;
  getItemRef: (idx: number) => (el: HTMLDivElement | null) => void;
  editingInputRef: React.RefObject<HTMLInputElement | null>;
}

function TemplateRow({
  template,
  index,
  isActive,
  isEditing,
  isConfirmingDelete,
  editingName,
  onSelect,
  onEditStart,
  onEditNameChange,
  onEditCommit,
  onEditCancel,
  onDeleteStart,
  onDeleteConfirm,
  onDeleteCancel,
  usageCount,
  onDuplicate,
  getItemRef,
  editingInputRef,
}: TemplateRowProps) {
  const showActions = !isEditing;
  const isBuiltIn = template.built_in;

  return (
    <div
      key={template.id}
      className="template-item"
      role="option"
      aria-selected={isActive}
      aria-label={`Template: ${template.name}${usageCount > 0 ? `, used by ${usageCount} workspace${usageCount !== 1 ? "s" : ""}` : ""}`}
    >
      <div
        className={`template-item-row${isActive ? " template-item-active" : ""}`}
        ref={getItemRef(index)}
        tabIndex={isActive ? 0 : -1}
        onClick={(e) => {
          onSelect(index);
          e.currentTarget.focus();
        }}
        onDoubleClick={() => {
          if (!isBuiltIn) onEditStart(template.id, template.name);
        }}
        onFocus={() => onSelect(index)}
      >
        {isEditing ? (
          <div className="template-rename-wrapper">
            <input
              ref={editingInputRef}
              className="template-rename-input"
              value={editingName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") onEditCommit();
                if (e.key === "Escape") onEditCancel();
              }}
              onBlur={onEditCommit}
              onClick={(e) => e.stopPropagation()}
              aria-label="Rename template"
            />
            <button
              className="template-rename-confirm"
              onClick={(e) => {
                e.stopPropagation();
                onEditCommit();
              }}
              aria-label="Confirm rename"
              title="Confirm"
            >
              <Check size={12} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <span className="template-item-name" title={template.name}>
            {template.name}
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
            {onDuplicate && (
              <button
                className="template-item-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(template.id);
                }}
                aria-label={`Duplicate ${template.name}`}
                title="Duplicate"
              >
                <Copy size={13} />
              </button>
            )}
            <button
              className={`template-item-btn${isBuiltIn ? " template-item-btn-disabled" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isBuiltIn) return;
                onEditStart(template.id, template.name);
              }}
              aria-label={`Rename ${template.name}`}
              aria-disabled={isBuiltIn}
              title={isBuiltIn ? "Built-in layouts can't be renamed" : "Rename"}
            >
              <Pencil size={13} />
            </button>
            <button
              className={`template-item-btn template-item-btn-delete${isConfirmingDelete ? " template-item-btn-delete-confirm" : ""}${isBuiltIn ? " template-item-btn-disabled" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isBuiltIn) return;
                if (isConfirmingDelete) {
                  onDeleteConfirm(template.id);
                } else {
                  onDeleteStart(template.id);
                }
              }}
              onBlur={onDeleteCancel}
              aria-label={isConfirmingDelete ? `Confirm delete ${template.name}` : `Delete ${template.name}`}
              aria-disabled={isBuiltIn}
              title={isBuiltIn ? "Built-in layouts can't be deleted" : isConfirmingDelete ? "Click again to confirm delete" : "Delete"}
            >
              {isConfirmingDelete ? <Check size={13} strokeWidth={3} /> : <Trash2 size={13} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManageTemplatesModal({
  open,
  templates,
  onRenameTemplate,
  onDeleteTemplate,
  onClose,
  onDuplicateTemplate,
  workspaceCounts,
}: ManageTemplatesModalProps) {
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

  useFocusTrap(dialogRef);
  useReclaimFocus();

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

  const moveActive = useCallback(
    (idx: number) => {
      setActiveIndex(idx);
      scrollIntoView(idx);
      itemRefs.current.get(idx)?.focus();
    },
    [scrollIntoView]
  );

  const wasEditingOrConfirming = useRef(false);
  useEffect(() => {
    const isEditingOrConfirming = editingId !== null || confirmingDeleteId !== null;
    if (wasEditingOrConfirming.current && !isEditingOrConfirming) {
      const insideDialog = dialogRef.current?.contains(document.activeElement);
      if (!insideDialog) {
        itemRefs.current.get(activeIndex)?.focus();
      }
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

  const handleListKeyDown = useTemplateKeyboardNavigation(
    filteredTemplates,
    activeIndex,
    moveActive,
    editingId,
    confirmingDeleteId,
    setConfirmingDeleteId,
    () => {
      if (activeTemplate && !activeTemplate.built_in)
        startRename(activeTemplate.id, activeTemplate.name);
    },
    () => {
      if (activeTemplate && !activeTemplate.built_in) startDelete(activeTemplate.id);
    },
    () => {
      if (activeTemplate && !activeTemplate.built_in) {
        onDeleteTemplate(activeTemplate.id);
        setConfirmingDeleteId(null);
      }
    },
    () => {
      searchInputRef.current?.focus();
    }
  );

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

  if (!mounted) return null;

  const overlayClass = `dialog-overlay${visible ? " open" : " closing"}`;
  const dialogClass = `dialog template-manager-dialog${visible ? " open" : " closing"}`;

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

          {filteredTemplates.map((t, idx) => (
            <TemplateRow
              key={t.id}
              template={t}
              index={idx}
              isActive={idx === activeIndex}
              isEditing={editingId === t.id}
              isConfirmingDelete={confirmingDeleteId === t.id}
              editingName={editValue}
              onSelect={moveActive}
              onEditStart={startRename}
              onEditNameChange={setEditValue}
              onEditCommit={commitRename}
              onEditCancel={() => setEditingId(null)}
              onDeleteStart={startDelete}
              onDeleteConfirm={(id) => {
                onDeleteTemplate(id);
                setConfirmingDeleteId(null);
              }}
              onDeleteCancel={() =>
                setConfirmingDeleteId((prev) => (prev === t.id ? null : prev))
              }
              usageCount={workspaceCounts?.[t.id] ?? 0}
              onDuplicate={onDuplicateTemplate}
              getItemRef={getItemRef}
              editingInputRef={editingInputRef}
            />
          ))}
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
