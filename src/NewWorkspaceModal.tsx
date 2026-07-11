import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { LayoutTemplate, ArrowUpDown, Pencil, Trash2, Check, Settings2 } from "lucide-react";
import type { Layout } from "./types/screen";
import { Dialog } from "./components/Dialog";
import SearchBar from "./components/SearchBar";
import TemplateMiniature from "./components/TemplateMiniature";
import { Button, Input, Badge } from "./components/ui";
import "./NewWorkspaceModal.css";

interface NewWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  templates: Layout[];
  onSelect: (templateId: string) => void;
  onRenameTemplate: (id: string, newName: string) => void;
  onDeleteTemplate: (id: string) => void;
  initialEditing?: boolean;
}

export default function NewWorkspaceModal({
  open,
  onClose,
  templates,
  onSelect,
  onRenameTemplate,
  onDeleteTemplate,
  initialEditing = false,
}: NewWorkspaceModalProps) {
  const [editing, setEditing] = useState(false);

  const [filterQuery, setFilterQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const editingInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setEditing(initialEditing);
      setFilterQuery("");
      setActiveIndex(0);
      setSortOrder("asc");
      setConfirmedId(null);
      setEditingId(null);
      setEditValue("");
      setConfirmingDeleteId(null);
    }
  }, [open, initialEditing]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    itemRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filterQuery]);

  useEffect(() => {
    if (editingId && editingInputRef.current) {
      editingInputRef.current.focus();
      editingInputRef.current.select();
    }
  }, [editingId]);

  const visible = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    const result = q
      ? templates.filter((t) => t.name.toLowerCase().includes(q))
      : [...templates];
    if (editing) {
      result.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name);
        return sortOrder === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [templates, filterQuery, editing, sortOrder]);

  useEffect(() => {
    if (activeIndex >= visible.length) {
      setActiveIndex(Math.max(0, visible.length - 1));
    }
  }, [visible.length, activeIndex]);

  const selectedTemplate = visible[activeIndex] ?? null;

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

  function startRename(t: Layout) {
    if (t.built_in) return;
    setEditingId(t.id);
    setEditValue(t.name);
    setConfirmingDeleteId(null);
  }

  function toggleEditing() {
    setEditing((prev) => {
      const next = !prev;
      // Leaving edit mode: clear any in-flight edit/delete affordances.
      if (!next) {
        setEditingId(null);
        setConfirmingDeleteId(null);
      }
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      toggleEditing();
      return;
    }

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
      e.stopPropagation();
      onClose();
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
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
        setActiveIndex(visible.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const t = visible[activeIndex];
        if (!t) break;
        if (editing) {
          startRename(t);
        } else {
          handleSelect(t.id);
        }
        break;
      }
      case "Delete":
      case "Backspace": {
        if (!editing) break;
        e.preventDefault();
        const t = visible[activeIndex];
        if (!t || t.built_in) break;
        if (confirmingDeleteId === t.id) {
          onDeleteTemplate(t.id);
          setConfirmingDeleteId(null);
        } else {
          setConfirmingDeleteId(t.id);
        }
        break;
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit Templates" : "New Workspace"}
      className={`new-workspace-dialog${editing ? " nwm-editing" : ""}`}
      overlayClassName="dialog-overlay--action"
      width={600}
      autoFocus={false}
      onKeyDown={handleKeyDown}
      header={
        <div className="nwm-header">
          <div className="nwm-header-title">
            {editing ? <Settings2 size={13} /> : <LayoutTemplate size={13} />}
            {editing ? "Edit Templates" : "New Workspace"}
          </div>
          <Button
            variant={editing ? "primary" : "ghost"}
            size="sm"
            onClick={toggleEditing}
            title="Toggle edit mode (⌘E)"
          >
            {editing ? <Check size={12} /> : <Pencil size={12} />}
            {editing ? " Done" : " Edit"}
          </Button>
        </div>
      }
    >
      <div className="nwm-body">
        <div className="nwm-left">
          <SearchBar
            ref={searchRef}
            value={filterQuery}
            onChange={setFilterQuery}
            placeholder={editing ? "Search templates…" : "Filter templates…"}
            trailing={
              editing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                  title={sortOrder === "asc" ? "Sort Z–A" : "Sort A–Z"}
                  tabIndex={-1}
                >
                  <ArrowUpDown size={12} />
                </Button>
              ) : null
            }
          />

          {templates.length === 0 ? (
            <div className="new-workspace-empty">
              <span className="new-workspace-empty-icon" aria-hidden="true">
                <LayoutTemplate size={32} strokeWidth={1.5} />
              </span>
              <span className="new-workspace-empty-text">No templates available</span>
              <span className="new-workspace-empty-hint">Save a layout to get started</span>
            </div>
          ) : visible.length === 0 ? (
            <div className="new-workspace-empty">
              <span className="new-workspace-empty-text">No matching templates</span>
              <span className="new-workspace-empty-hint">Try a different search term</span>
            </div>
          ) : (
            <div className="new-workspace-list" role="listbox" aria-label="Layout templates">
              {visible.map((t, idx) => {
                const isActive = idx === activeIndex;
                const isRenaming = editingId === t.id;
                const isConfirmingDelete = confirmingDeleteId === t.id;
                const isConfirmed = confirmedId === t.id;
                return (
                  <div
                    key={t.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(idx, el);
                      else itemRefs.current.delete(idx);
                    }}
                    className={`new-workspace-item${isActive ? " new-workspace-item-active" : ""}${isConfirmed ? " new-workspace-item--confirmed" : ""}${editing ? " new-workspace-item--edit" : ""}`}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => {
                      setActiveIndex(idx);
                      if (!editing) handleSelect(t.id);
                    }}
                    onDoubleClick={() => {
                      if (editing) startRename(t);
                    }}
                    onMouseEnter={() => { if (!confirmedId) setActiveIndex(idx); }}
                  >
                    {isRenaming ? (
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(v) => setEditValue(v)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="new-workspace-item-name">{t.name}</span>
                    )}

                    {!isRenaming && (
                      editing ? (
                        <div className="nwm-manager-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={t.built_in}
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(t);
                            }}
                            title={t.built_in ? "Built-in templates can't be renamed" : "Rename"}
                            tabIndex={-1}
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={t.built_in}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (t.built_in) return;
                              setActiveIndex(idx);
                              if (isConfirmingDelete) {
                                onDeleteTemplate(t.id);
                                setConfirmingDeleteId(null);
                              } else {
                                setConfirmingDeleteId(t.id);
                              }
                            }}
                            title={
                              t.built_in
                                ? "Built-in templates can't be deleted"
                                : isConfirmingDelete
                                ? "Click again to confirm"
                                : "Delete"
                            }
                            tabIndex={-1}
                          >
                            {isConfirmingDelete ? <Check size={12} strokeWidth={3} /> : <Trash2 size={12} />}
                          </Button>
                        </div>
                      ) : isConfirmed ? (
                        <Check size={13} className="new-workspace-item-check" />
                      ) : null
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="nwm-right">
          {selectedTemplate ? (
            <div className="nwm-preview">
              <div className="nwm-preview-header">
                <span className="nwm-preview-name">{selectedTemplate.name}</span>
                {selectedTemplate.built_in && (
                  <Badge size="sm" variant="default">Built-in</Badge>
                )}
              </div>
              <div className="nwm-preview-mini">
                <TemplateMiniature
                  screen={selectedTemplate.screen}
                  width={160}
                  height={120}
                />
              </div>
            </div>
          ) : (
            <div className="nwm-preview nwm-preview--empty">
              <LayoutTemplate size={24} strokeWidth={1.5} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                Select a template to preview
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="new-workspace-footer">
        <span className="new-workspace-footer-hints">
          <kbd>↑</kbd><kbd>↓</kbd> navigate
          <span className="new-workspace-footer-sep" />
          {editing ? (
            <>
              <kbd>↵</kbd> rename
              <span className="new-workspace-footer-sep" />
              <kbd>⌫</kbd> delete
              <span className="new-workspace-footer-sep" />
              <kbd>⌘</kbd><kbd>E</kbd> done
            </>
          ) : (
            <>
              <kbd>↵</kbd> create
              <span className="new-workspace-footer-sep" />
              <kbd>⌘</kbd><kbd>E</kbd> edit
            </>
          )}
          <span className="new-workspace-footer-sep" />
          <kbd>Esc</kbd> close
        </span>
      </div>
    </Dialog>
  );
}
