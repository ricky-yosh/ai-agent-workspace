import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { LayoutTemplate, Search, Plus, ArrowUpDown, Pencil, Trash2, Check } from "lucide-react";
import type { Layout } from "./types/screen";
import "./NewWorkspaceModal.css";

interface NewWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  templates: Layout[];
  onSelect: (templateId: string) => void;
  onRenameTemplate: (id: string, newName: string) => void;
  onDeleteTemplate: (id: string) => void;
  initialTab?: "picker" | "manager";
}

export default function NewWorkspaceModal({
  open,
  onClose,
  templates,
  onSelect,
  onRenameTemplate,
  onDeleteTemplate,
  initialTab = "picker",
}: NewWorkspaceModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const [tab, setTab] = useState<"picker" | "manager">("picker");

  // Picker state
  const [filterQuery, setFilterQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  // Manager state
  const [mgSearchQuery, setMgSearchQuery] = useState("");
  const [mgSortOrder, setMgSortOrder] = useState<"asc" | "desc">("asc");
  const [mgActiveIndex, setMgActiveIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const mgSearchRef = useRef<HTMLInputElement>(null);
  const pickerItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const mgItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const editingInputRef = useRef<HTMLInputElement>(null);

  // Mount / unmount with animation
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Reset all state on open
      setTab(initialTab);
      setFilterQuery("");
      setActiveIndex(0);
      setMgSearchQuery("");
      setMgSortOrder("asc");
      setMgActiveIndex(0);
      setEditingId(null);
      setEditValue("");
      setConfirmingDeleteId(null);
      setConfirmedId(null);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(raf);
    } else if (mounted) {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Focus appropriate search input when tab changes
  useEffect(() => {
    if (!visible) return;
    if (tab === "picker") {
      pickerSearchRef.current?.focus();
      setMgActiveIndex(0);
    } else {
      mgSearchRef.current?.focus();
      setActiveIndex(0);
    }
  }, [tab, visible]);

  // Scroll picker active item into view
  useEffect(() => {
    pickerItemRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Reset picker active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filterQuery]);

  // Scroll manager active item into view
  useEffect(() => {
    mgItemRefs.current.get(mgActiveIndex)?.scrollIntoView({ block: "nearest" });
  }, [mgActiveIndex]);

  // Focus editing input when editingId changes
  useEffect(() => {
    if (editingId && editingInputRef.current) {
      editingInputRef.current.focus();
      editingInputRef.current.select();
    }
  }, [editingId]);

  const filtered = useMemo(
    () => templates.filter((t) => t.name.toLowerCase().includes(filterQuery.toLowerCase())),
    [templates, filterQuery]
  );

  const filteredForManager = useMemo(() => {
    const q = mgSearchQuery.toLowerCase().trim();
    const result = q
      ? templates.filter((t) => t.name.toLowerCase().includes(q))
      : [...templates];
    result.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return mgSortOrder === "asc" ? cmp : -cmp;
    });
    return result;
  }, [templates, mgSearchQuery, mgSortOrder]);

  const handleSelect = useCallback(
    (templateId: string) => {
      if (confirmedId) return;
      setConfirmedId(templateId);
      setTimeout(() => {
        onSelect(templateId);
        onClose();
      }, 160);
    },
    [onSelect, onClose, confirmedId]
  );

  function commitRename() {
    if (editingId && editValue.trim()) {
      onRenameTemplate(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  function handlePickerKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
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
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const t = filtered[activeIndex];
        if (t) handleSelect(t.id);
        break;
      }
    }
  }

  function handleManagerKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setMgActiveIndex((i) => Math.min(i + 1, filteredForManager.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setMgActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setMgActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setMgActiveIndex(filteredForManager.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const t = filteredForManager[mgActiveIndex];
        if (t && !t.built_in) {
          setEditingId(t.id);
          setEditValue(t.name);
        }
        break;
      }
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        const t = filteredForManager[mgActiveIndex];
        if (!t || t.built_in) break;
        if (confirmingDeleteId === t.id) {
          onDeleteTemplate(t.id);
          setConfirmingDeleteId(null);
        } else {
          setConfirmingDeleteId(t.id ?? null);
        }
        break;
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Tab switching
    if (e.metaKey && e.key === "1") {
      e.preventDefault();
      setTab("picker");
      return;
    }
    if (e.metaKey && e.key === "2") {
      e.preventDefault();
      setTab("manager");
      return;
    }

    // Escape: check editing/confirming before closing
    if (e.key === "Escape") {
      if (editingId) {
        e.preventDefault();
        e.stopPropagation();
        setEditingId(null);
        return;
      }
      if (confirmingDeleteId) {
        e.preventDefault();
        e.stopPropagation();
        setConfirmingDeleteId(null);
        return;
      }
      e.preventDefault();
      onClose();
      return;
    }

    if (tab === "picker") {
      handlePickerKey(e);
    } else {
      handleManagerKey(e);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  if (!mounted) return null;

  const overlayClass = `dialog-overlay dialog-overlay--action${visible ? " open" : " closing"}`;
  const dialogClass = `dialog new-workspace-dialog${visible ? " open" : " closing"}`;

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
        aria-label="New Workspace"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Tab strip */}
        <div className="nwm-tabs" role="tablist">
          <button
            className={`nwm-tab${tab === "picker" ? " nwm-tab--active" : ""}`}
            role="tab"
            aria-selected={tab === "picker"}
            onClick={() => setTab("picker")}
          >
            <Plus size={12} />
            New Workspace
          </button>
          <button
            className={`nwm-tab${tab === "manager" ? " nwm-tab--active" : ""}`}
            role="tab"
            aria-selected={tab === "manager"}
            onClick={() => setTab("manager")}
          >
            <LayoutTemplate size={12} />
            Templates
          </button>
        </div>

        {/* Picker tab */}
        {tab === "picker" && (
          <>
            <div className="new-workspace-search">
              <Search size={14} className="new-workspace-search-icon" />
              <input
                ref={pickerSearchRef}
                className="new-workspace-search-input"
                placeholder="Filter templates…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
            </div>

            {templates.length === 0 ? (
              <div className="new-workspace-empty">
                <span className="new-workspace-empty-icon" aria-hidden="true">
                  <LayoutTemplate size={32} strokeWidth={1.5} />
                </span>
                <span className="new-workspace-empty-text">No templates available</span>
                <span className="new-workspace-empty-hint">Create a template to get started</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="new-workspace-empty">
                <span className="new-workspace-empty-text">No matching templates</span>
                <span className="new-workspace-empty-hint">Try a different search term</span>
              </div>
            ) : (
              <div
                className="new-workspace-list"
                role="listbox"
                aria-label="Layout templates"
              >
                {filtered.map((t, idx) => {
                  const panelCount = t.screen.areas.length;
                  const isConfirmed = confirmedId === t.id;
                  return (
                    <div
                      key={t.id}
                      ref={(el) => {
                        if (el) pickerItemRefs.current.set(idx, el);
                        else pickerItemRefs.current.delete(idx);
                      }}
                      className={`new-workspace-item${idx === activeIndex ? " new-workspace-item-active" : ""}${isConfirmed ? " new-workspace-item--confirmed" : ""}`}
                      role="option"
                      aria-selected={idx === activeIndex}
                      tabIndex={idx === activeIndex ? 0 : -1}
                      onClick={() => handleSelect(t.id)}
                      onMouseEnter={() => { if (!confirmedId) setActiveIndex(idx); }}
                    >
                      <span className="new-workspace-item-name">{t.name}</span>
                      {isConfirmed
                        ? <Check size={13} className="new-workspace-item-check" />
                        : <span className="new-workspace-item-meta">{panelCount} panel{panelCount !== 1 ? "s" : ""}</span>
                      }
                    </div>
                  );
                })}
              </div>
            )}

            <div className="new-workspace-footer">
              <span className="new-workspace-footer-hints">
                <kbd>↑</kbd><kbd>↓</kbd> navigate
                <span className="new-workspace-footer-sep" />
                <kbd>↵</kbd> create
                <span className="new-workspace-footer-sep" />
                <kbd>⌘</kbd><kbd>2</kbd> templates
              </span>
            </div>
          </>
        )}

        {/* Manager tab */}
        {tab === "manager" && (
          <>
            <div className="new-workspace-search">
              <Search size={14} className="new-workspace-search-icon" />
              <input
                ref={mgSearchRef}
                className="new-workspace-search-input"
                placeholder="Search templates…"
                value={mgSearchQuery}
                onChange={(e) => {
                  setMgSearchQuery(e.target.value);
                  setMgActiveIndex(0);
                }}
              />
              <button
                className="nwm-sort-btn"
                onClick={() => setMgSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                title={mgSortOrder === "asc" ? "Sort Z–A" : "Sort A–Z"}
                tabIndex={-1}
              >
                <ArrowUpDown size={12} />
              </button>
            </div>

            <div className="nwm-manager-list" role="listbox">
              {filteredForManager.length === 0 && (
                <div className="new-workspace-empty">
                  <span className="new-workspace-empty-text">
                    {mgSearchQuery ? `No results for "${mgSearchQuery}"` : "No templates saved"}
                  </span>
                </div>
              )}
              {filteredForManager.map((t, idx) => {
                const isActive = idx === mgActiveIndex;
                const isEditing = editingId === t.id;
                const isConfirming = confirmingDeleteId === t.id;
                return (
                  <div
                    key={t.id}
                    ref={(el) => {
                      if (el) mgItemRefs.current.set(idx, el);
                      else mgItemRefs.current.delete(idx);
                    }}
                    className={`nwm-manager-item${isActive ? " nwm-manager-item--active" : ""}`}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setMgActiveIndex(idx)}
                    onFocus={() => setMgActiveIndex(idx)}
                    onDoubleClick={() => {
                      if (!t.built_in) {
                        setEditingId(t.id);
                        setEditValue(t.name);
                      }
                    }}
                  >
                    {isEditing ? (
                      <div className="nwm-manager-rename">
                        <input
                          ref={editingInputRef}
                          className="nwm-manager-rename-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={commitRename}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <span className="nwm-manager-name">{t.name}</span>
                    )}
                    <div className="nwm-manager-actions">
                      {!t.built_in && (
                        <button
                          className="nwm-manager-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(t.id);
                            setEditValue(t.name);
                            setMgActiveIndex(idx);
                          }}
                          title="Rename"
                          tabIndex={-1}
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      <button
                        className={`nwm-manager-btn nwm-manager-btn--delete${isConfirming ? " nwm-manager-btn--confirm" : ""}${t.built_in ? " nwm-manager-btn--disabled" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (t.built_in) return;
                          if (isConfirming) {
                            onDeleteTemplate(t.id);
                            setConfirmingDeleteId(null);
                          } else {
                            setConfirmingDeleteId(t.id);
                            setMgActiveIndex(idx);
                          }
                        }}
                        title={
                          t.built_in
                            ? "Built-in templates can't be deleted"
                            : isConfirming
                            ? "Click again to confirm"
                            : "Delete"
                        }
                        tabIndex={-1}
                      >
                        {isConfirming ? <Check size={12} strokeWidth={3} /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="new-workspace-footer">
              <span className="new-workspace-footer-hints">
                <kbd>↑</kbd><kbd>↓</kbd> navigate
                <span className="new-workspace-footer-sep" />
                <kbd>↵</kbd> rename
                <span className="new-workspace-footer-sep" />
                <kbd>⌫</kbd> delete
                <span className="new-workspace-footer-sep" />
                <kbd>⌘</kbd><kbd>1</kbd> new
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
