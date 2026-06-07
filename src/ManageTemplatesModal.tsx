import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import type { Layout } from "./SplitLayout";
import "./ManageTemplatesModal.css";

interface ManageTemplatesModalProps {
  templates: Layout[];
  onRenameTemplate: (id: string, newName: string) => void;
  onDeleteTemplate: (id: string) => void;
  onClose: () => void;
}

export default function ManageTemplatesModal({
  templates,
  onRenameTemplate,
  onDeleteTemplate,
  onClose,
}: ManageTemplatesModalProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenameTemplate(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog" ref={panelRef} onClick={(e) => e.stopPropagation()} style={{ width: 320, minWidth: 320 }}>
        <div className="dialog-title-row">
          <div className="dialog-title">Manage Layout Templates</div>
          <button className="dialog-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="template-list">
          {templates.length === 0 ? (
            <div className="template-empty">No templates saved</div>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="template-item">
                <div className="template-item-row">
                  {renamingId === t.id ? (
                    <input
                      ref={renameInputRef}
                      className="template-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span className="template-item-name">{t.name}</span>
                  )}
                  {renamingId !== t.id && (
                    <div className="template-item-actions">
                      <button
                        className="template-item-btn"
                        onClick={() => {
                          setRenamingId(t.id);
                          setRenameValue(t.name);
                          setConfirmingDeleteId(null);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="template-item-btn template-item-btn-delete"
                        onClick={() => {
                          setConfirmingDeleteId(confirmingDeleteId === t.id ? null : t.id);
                          setRenamingId(null);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {confirmingDeleteId === t.id && (
                  <div className="template-confirm-delete">
                    <div className="template-confirm-text">"{t.name}" will be removed</div>
                    <div className="template-confirm-actions">
                      <button
                        className="dialog-btn dialog-btn-delete"
                        onClick={() => {
                          onDeleteTemplate(t.id);
                          setConfirmingDeleteId(null);
                        }}
                      >
                        Delete
                      </button>
                      <button
                        className="dialog-btn"
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
