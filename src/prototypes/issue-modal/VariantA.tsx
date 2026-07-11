// Variant A — Action Menu with sub-pages
// Actions listed with keyboard shortcuts. Press T/B/L to open a dedicated sub-page.
// Each sub-page has a back button, focused input, and confirm/save action.
// Escape goes back to the main action list from any sub-page.

import { useState, useRef, useEffect } from "react";
import { Dialog } from "../../components/Dialog";
import { Button } from "../../components/ui";
import { Trash2, Type, AlignLeft, Tag, ChevronLeft } from "lucide-react";

const LABELS = [
  { key: "1", value: "needs-triage", bg: "oklch(0.28 0.05 90)", fg: "oklch(0.72 0.13 90)" },
  { key: "2", value: "ready-for-agent", bg: "oklch(0.3 0.05 160)", fg: "oklch(0.72 0.13 160)" },
  { key: "3", value: "ready-for-human", bg: "oklch(0.28 0.05 245)", fg: "oklch(0.68 0.13 245)" },
  { key: "4", value: "needs-info", bg: "oklch(0.28 0.05 65)", fg: "oklch(0.72 0.13 65)" },
  { key: "5", value: "wontfix", bg: "oklch(0.25 0.05 25)", fg: "oklch(0.68 0.13 25)" },
] as const;

interface Props { open: boolean; onClose: () => void; isEdit?: boolean; }

type SubPage = null | "title" | "body" | "label";

export default function VariantA({ open, onClose, isEdit }: Props) {
  const [title, setTitle] = useState(isEdit ? "Fix login bug" : "");
  const [body, setBody] = useState(isEdit ? "User reports 500 on /login when email contains a + sign" : "");
  const [label, setLabel] = useState("needs-triage");
  const [activeIdx, setActiveIdx] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [draftValue, setDraftValue] = useState("");
  const [labelPickerIdx, setLabelPickerIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const actions = isEdit
    ? [
        { id: "title" as const, key: "T", icon: Type, label: "Edit title", value: title },
        { id: "body" as const, key: "B", icon: AlignLeft, label: "Edit body", value: body },
        { id: "label" as const, key: "L", icon: Tag, label: "Set label", value: label },
        { id: "delete" as const, key: "⌫", icon: Trash2, label: confirmingDelete ? "Confirm delete" : "Delete", destructive: true },
      ]
    : [
        { id: "title" as const, key: "T", icon: Type, label: "Set title", value: title || "" },
        { id: "body" as const, key: "B", icon: AlignLeft, label: "Set body", value: body || "" },
        { id: "label" as const, key: "L", icon: Tag, label: "Set label", value: label },
      ];

  useEffect(() => {
    if (open) { setActiveIdx(0); setConfirmingDelete(false); setSubPage(null); }
  }, [open]);

  useEffect(() => {
    if (subPage === "title" && inputRef.current) inputRef.current.focus();
    if (subPage === "body" && textareaRef.current) textareaRef.current.focus();
  }, [subPage]);

  function openSubPage(id: SubPage) {
    if (!id) return;
    if (id === "title") setDraftValue(title);
    if (id === "body") setDraftValue(body);
    if (id === "label") setLabelPickerIdx(LABELS.findIndex(l => l.value === label));
    setSubPage(id);
  }

  function commitSubPage() {
    if (subPage === "title") setTitle(draftValue);
    if (subPage === "body") setBody(draftValue);
    setSubPage(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (subPage === "title" || subPage === "body") {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault(); commitSubPage(); return;
      }
      if (e.key === "Escape") { e.preventDefault(); setSubPage(null); return; }
      if (e.key === "Enter" && subPage === "title") {
        e.preventDefault(); commitSubPage(); return;
      }
      return;
    }
    if (subPage === "label") {
      switch (e.key) {
        case "ArrowDown": case "ArrowRight": e.preventDefault(); setLabelPickerIdx(i => Math.min(i + 1, LABELS.length - 1)); return;
        case "ArrowUp": case "ArrowLeft": e.preventDefault(); setLabelPickerIdx(i => Math.max(i - 1, 0)); return;
        case "Enter": e.preventDefault(); setLabel(LABELS[labelPickerIdx].value); setSubPage(null); return;
        case "Escape": e.preventDefault(); setSubPage(null); return;
        default:
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 5) { e.preventDefault(); setLabel(LABELS[num - 1].value); setSubPage(null); }
          }
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActiveIdx(i => Math.min(i + 1, actions.length - 1)); return;
      case "ArrowUp": e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return;
      case "Enter": e.preventDefault(); const a = actions[activeIdx];
        if (a.id === "delete") {
          if (!confirmingDelete) setConfirmingDelete(true); else onClose();
        } else {
          openSubPage(a.id);
        }
        return;
      case "Escape": onClose(); return;
      default:
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const upper = e.key.toUpperCase();
          const a = actions.find(a => a.key === upper);
          if (a) { e.preventDefault(); setActiveIdx(actions.indexOf(a)); if (a.id !== "delete") openSubPage(a.id); else if (!confirmingDelete) setConfirmingDelete(true); else onClose(); return; }
        }
    }
  }

  const labelDef = LABELS.find(l => l.value === label) ?? LABELS[0];
  const deleteCss = "var(--danger)";

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit Issue" : "New Issue"} onKeyDown={handleKeyDown} width={440}>
      {/* ── Title sub-page ── */}
      {subPage === "title" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 12, color: "var(--text-muted)" }}>
            <button onClick={() => setSubPage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 2, padding: 0, fontFamily: "inherit", fontSize: 12 }}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
          <input ref={inputRef} value={draftValue} onChange={e => setDraftValue(e.target.value)}
            placeholder="Brief description of the issue"
            onKeyDown={e => { e.stopPropagation(); }}
            style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text-primary)", fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setSubPage(null)}>Cancel</Button>
            <Button variant="primary" onClick={commitSubPage}>Save</Button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
            <span><kbd>↵</kbd> save</span>
            <span><kbd>Esc</kbd> back</span>
          </div>
        </div>
      )}

      {/* ── Body sub-page ── */}
      {subPage === "body" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 12, color: "var(--text-muted)" }}>
            <button onClick={() => setSubPage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 2, padding: 0, fontFamily: "inherit", fontSize: 12 }}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
          <textarea ref={textareaRef} value={draftValue} onChange={e => setDraftValue(e.target.value)}
            placeholder="Add details, steps to reproduce, or notes (Markdown supported)"
            onKeyDown={e => { e.stopPropagation(); }}
            rows={8}
            style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, padding: 8, color: "var(--text-primary)", fontFamily: "inherit", fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.5, boxSizing: "border-box" }} />
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setSubPage(null)}>Cancel</Button>
            <Button variant="primary" onClick={commitSubPage}>Save</Button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
            <span><kbd>⌘↵</kbd> save</span>
            <span><kbd>Esc</kbd> back</span>
          </div>
        </div>
      )}

      {/* ── Label sub-page ── */}
      {subPage === "label" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12, color: "var(--text-muted)" }}>
            <button onClick={() => setSubPage(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 2, padding: 0, fontFamily: "inherit", fontSize: 12 }}>
              <ChevronLeft size={14} /> Back
            </button>
            <span>— choose a triage label</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {LABELS.map((l, i) => (
              <div key={l.value}
                onClick={() => { setLabel(l.value); setSubPage(null); }}
                onMouseEnter={() => setLabelPickerIdx(i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 6, cursor: "pointer", background: i === labelPickerIdx ? "rgba(0,120,212,0.15)" : "transparent", fontSize: 13 }}>
                <span style={{ fontSize: 11, width: 16, color: "var(--text-muted)", textAlign: "right" }}>{l.key}</span>
                <span style={{ padding: "2px 10px", borderRadius: 4, background: l.bg, color: l.fg, fontSize: 12, fontWeight: label === l.value ? 600 : 400 }}>{l.value}</span>
                {label === l.value && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>current</span>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
            <span><kbd>↑↓</kbd> or <kbd>1-5</kbd> pick</span>
            <span><kbd>↵</kbd> select</span>
            <span><kbd>Esc</kbd> back</span>
          </div>
        </div>
      )}

      {/* ── Main action list ── */}
      {!subPage && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {actions.map((a, i) => (
              <div key={a.id}
                onClick={() => { setActiveIdx(i); if (a.id === "delete") { if (!confirmingDelete) setConfirmingDelete(true); else onClose(); } else { openSubPage(a.id); } }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, cursor: "pointer", background: i === activeIdx ? "rgba(0,120,212,0.15)" : "transparent", color: a.destructive ? "var(--danger)" : "var(--text-primary)", fontSize: 13 }}
                onMouseEnter={() => setActiveIdx(i)}>
                <a.icon size={14} style={{ color: a.destructive ? deleteCss : "var(--text-muted)", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.id === "label" ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{a.label}</span>
                      <span style={{ padding: "1px 6px", borderRadius: 4, background: labelDef.bg, color: labelDef.fg, fontSize: 11 }}>{label}</span>
                    </span>
                  ) : a.value ? (
                    <span>{a.value}</span>
                  ) : (
                    <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>{a.id === "delete" ? a.label : "(empty)"}</span>
                  )}
                </span>
                <kbd style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "inherit", flexShrink: 0 }}>{a.key}</kbd>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={onClose}>{isEdit ? "Save" : "Create"}</Button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
            <span><kbd>↑↓</kbd> nav</span>
            <span><kbd>T</kbd> title</span>
            <span><kbd>B</kbd> body</span>
            <span><kbd>L</kbd> label</span>
            <span><kbd>⌫</kbd> delete</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
