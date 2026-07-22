import { useState, useEffect, useCallback } from "react";
import { Dialog } from "./components/Dialog";
import { Input as UiInput } from "./components/ui";
import { Type, Trash2, ChevronLeft, Plus, Check } from "lucide-react";
import { safeInvoke } from "./safeInvoke";
import "./CanvasModal.css";

interface VisualCanvas {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface CanvasModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  canvas?: VisualCanvas | null;
}

type SubPage = null | "name";

export default function CanvasModal({ open, onClose, sessionId, canvas }: CanvasModalProps) {
  const isEdit = Boolean(canvas);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [draftValue, setDraftValue] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const actions = isEdit
    ? [
        { id: "name" as const, key: "N", icon: Type, label: "Rename", value: name },
        { id: "delete" as const, key: "⌫", icon: Trash2, label: confirmingDelete ? "Confirm delete" : "Delete", destructive: true },
        { id: "submit" as const, key: "⌘↵", icon: Check, label: "Save changes" },
      ]
    : [
        { id: "name" as const, key: "N", icon: Type, label: "Set name", value: name || "" },
        { id: "submit" as const, key: "⌘↵", icon: Plus, label: "Create canvas" },
      ];

  useEffect(() => {
    if (open) {
      if (canvas) {
        setName(canvas.name);
      } else {
        setName("");
      }
      setSaving(false);
      setError(null);
      setConfirmingDelete(false);
      setSubPage(null);
      setActiveIdx(0);
    }
  }, [open, canvas]);

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && canvas) {
        await safeInvoke("rename_visual_canvas", {
          id: canvas.id, name: trimmed,
        });
      } else {
        await safeInvoke("create_visual_canvas", {
          sessionId, name: trimmed,
        });
      }
      onClose();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }, [name, sessionId, isEdit, canvas, onClose]);

  const handleDelete = useCallback(async () => {
    if (!canvas || !confirmingDelete) return;
    setSaving(true);
    setError(null);
    try {
      await safeInvoke("delete_visual_canvas", { id: canvas.id });
      onClose();
    } catch (err) {
      setError(String(err));
      setSaving(false);
      setConfirmingDelete(false);
    }
  }, [canvas, sessionId, confirmingDelete, onClose]);

  function openSubPage(page: SubPage) {
    if (!page) return;
    if (page === "name") setDraftValue(name);
    setSubPage(page);
  }

  function commitSubPage() {
    if (subPage === "name") setName(draftValue);
    setSubPage(null);
  }

  function triggerAction(a: typeof actions[number]) {
    if (a.id === "delete") {
      if (!confirmingDelete) setConfirmingDelete(true); else handleDelete();
    } else if (a.id === "submit") {
      handleSubmit();
    } else {
      openSubPage(a.id);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (saving) return;
    if (subPage === "name") {
      if (e.key === "Enter") { e.preventDefault(); commitSubPage(); return; }
      if (e.key === "Escape") { e.preventDefault(); setSubPage(null); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleSubmit(); return; }
    switch (e.key) {
      case "ArrowDown": e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, actions.length - 1)); return;
      case "ArrowUp": e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0)); return;
      case "Enter": e.preventDefault();
        triggerAction(actions[activeIdx]); return;
      case "Escape": onClose(); return;
      default:
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const upper = e.key.toUpperCase();
          const a = actions.find(a => a.key === upper);
          if (a) { e.preventDefault(); setActiveIdx(actions.indexOf(a)); triggerAction(a); return; }
        }
    }
  }

  const header = (
    <div className="canvas-modal-header">
      {isEdit ? `Rename "${canvas!.name}"` : "New Canvas"}
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? `Rename "${canvas!.name}"` : "New Canvas"} header={header} onKeyDown={handleKeyDown} width={400}>
      {error && <div className="canvas-modal-error">{error}</div>}

      {/* ── Name sub-page ── */}
      {subPage === "name" && (
        <div>
          <div className="canvas-modal-subhead">
            <button className="canvas-modal-back" onClick={() => setSubPage(null)}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
          <UiInput value={draftValue} onChange={v => setDraftValue(v)}
            placeholder="Name for the canvas"
            autoFocus />
          <div className="canvas-modal-hints">
            <span className="canvas-modal-hint"><kbd>↵</kbd> save</span>
            <span className="canvas-modal-hint"><kbd>Esc</kbd> back</span>
          </div>
        </div>
      )}

      {/* ── Main action list ── */}
      {!subPage && (
        <div>
          <div className="canvas-modal-list">
            {actions.map((a, i) => (
              <div key={a.id}
                className={`canvas-modal-item${i === activeIdx ? " canvas-modal-item--active" : ""}${a.destructive ? " canvas-modal-item--destructive" : ""}`}
                onClick={() => { setActiveIdx(i); triggerAction(a); }}
                onMouseEnter={() => setActiveIdx(i)}>
                {a.id === "submit" && saving
                  ? <span className="canvas-modal-spinner" aria-hidden="true" />
                  : <a.icon size={14} />}
                <span className="canvas-modal-item-body">
                  {a.id === "submit" || a.id === "delete" ? (
                    <span>{a.label}</span>
                  ) : a.value ? (
                    <span>{a.value}</span>
                  ) : (
                    <span className="canvas-modal-item-empty">(empty)</span>
                  )}
                </span>
                <kbd className="canvas-modal-item-key">{a.key}</kbd>
              </div>
            ))}
          </div>
          <div className="canvas-modal-hints">
            <span className="canvas-modal-hint"><kbd>↑↓</kbd> nav</span>
            <span className="canvas-modal-hint"><kbd>↵</kbd> select</span>
            <span className="canvas-modal-hint"><kbd>⌘↵</kbd> {isEdit ? "save" : "create"}</span>
            <span className="canvas-modal-hint"><kbd>Esc</kbd> cancel</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}
