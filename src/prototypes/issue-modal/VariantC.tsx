// Variant C — Stacked chips builder
// A single text area (the "composer"). Below it, action chips for title/label/body.
// Tab moves between composer and chips. Arrow keys navigate chips. Enter opens inline edit.

import { useState, useRef, useEffect } from "react";
import { Dialog } from "../../components/Dialog";
import { Button } from "../../components/ui";
import { Plus, Tag, Type } from "lucide-react";

const LABELS = [
  { value: "needs-triage", color: "oklch(0.28 0.05 90)", textColor: "oklch(0.72 0.13 90)" },
  { value: "ready-for-agent", color: "oklch(0.3 0.05 160)", textColor: "oklch(0.72 0.13 160)" },
  { value: "ready-for-human", color: "oklch(0.28 0.05 245)", textColor: "oklch(0.68 0.13 245)" },
  { value: "needs-info", color: "oklch(0.28 0.05 65)", textColor: "oklch(0.72 0.13 65)" },
  { value: "wontfix", color: "oklch(0.25 0.05 25)", textColor: "oklch(0.68 0.13 25)" },
] as const;

interface Props { open: boolean; onClose: () => void; isEdit?: boolean; }

export default function VariantC({ open, onClose, isEdit }: Props) {
  const [title, setTitle] = useState(isEdit ? "Fix login bug" : "");
  const [body, setBody] = useState(isEdit ? "User reports 500 on /login when email contains a + sign" : "");
  const [label, setLabel] = useState("needs-triage");
  const [mode, setMode] = useState<"composer" | "chips">("composer");
  const [chipIdx, setChipIdx] = useState(0);
  const [editingChip, setEditingChip] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chipInputRef = useRef<HTMLInputElement>(null);

  const chips = [
    { id: "title", icon: Type, label: "Title", value: title || "(empty)", placeholder: "Enter issue title…" },
    { id: "body", icon: Plus, label: "Body", value: body || "(empty)", placeholder: "Enter description…" },
    { id: "label", icon: Tag, label: "Label", value: label },
  ];

  useEffect(() => { if (open) { setMode("composer"); composerRef.current?.focus(); setEditingChip(null); } }, [open]);

  useEffect(() => {
    if (editingChip && chipInputRef.current) chipInputRef.current.focus();
  }, [editingChip]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingChip) return;
    if (e.key === "Tab") {
      e.preventDefault();
      setMode(m => m === "composer" ? "chips" : "composer");
      if (mode === "composer") chipInputRef.current?.focus();
      else composerRef.current?.focus();
      return;
    }
    if (mode === "chips") {
      switch (e.key) {
        case "ArrowRight": e.preventDefault(); setChipIdx(i => Math.min(i + 1, chips.length - 1)); return;
        case "ArrowLeft": e.preventDefault(); setChipIdx(i => Math.max(i - 1, 0)); return;
        case "Enter": {
          e.preventDefault(); const c = chips[chipIdx];
          if (c.id === "label") {
            const cur = LABELS.findIndex(l => l.value === label);
            setLabel(LABELS[(cur + 1) % LABELS.length].value);
          } else {
            setEditingChip(c.id); setEditValue(c.id === "title" ? title : body);
          }
          return;
        }
        case "Escape": onClose(); return;
      }
    }
    if (e.key === "Escape") onClose();
  }

  function commitChip() {
    if (editingChip === "title") setTitle(editValue);
    if (editingChip === "body") setBody(editValue);
    setEditingChip(null);
    composerRef.current?.focus();
    setMode("composer");
  }

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit Issue" : "New Issue"} onKeyDown={handleKeyDown} width={460}>
      <textarea ref={composerRef} value={editingChip === "body" ? editValue : body} onChange={e => {
        if (editingChip === "body") setEditValue(e.target.value);
        else setBody(e.target.value);
      }} onKeyDown={e => {
        if (editingChip === "body" && (e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); commitChip(); }
      }} placeholder="Describe the issue (Markdown supported)&#10;&#10;Tab to chips below to set title and label" rows={5}
      style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, padding: 8, color: "var(--text-primary)", fontFamily: "inherit", fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.5, boxSizing: "border-box" }} />

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {chips.map((c, i) => (
          <div key={c.id} onClick={() => { setMode("chips"); setChipIdx(i); }} tabIndex={-1} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, cursor: "pointer", background: mode === "chips" && chipIdx === i ? "rgba(0,120,212,0.15)" : "var(--bg-panel)", border: mode === "chips" && chipIdx === i ? "1px solid var(--accent)" : "1px solid var(--border)", fontSize: 11, outline: "none" }}>
            <c.icon size={12} style={{ color: "var(--text-muted)" }} />
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{c.label}:</span>
            {editingChip === c.id ? (
              c.id === "label" ? (
                <select value={label} onChange={e => setLabel(e.target.value)} onBlur={() => setEditingChip(null)} autoFocus style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-primary)", fontSize: 11, fontFamily: "inherit", outline: "none" }}>
                  {LABELS.map(l => <option key={l.value} value={l.value}>{l.value}</option>)}
                </select>
              ) : (
                <input ref={chipInputRef} value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commitChip(); if (e.key === "Escape") setEditingChip(null); }} onBlur={commitChip} style={{ width: 120, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 4px", color: "var(--text-primary)", fontSize: 11, outline: "none" }} />
              )
            ) : c.id === "label" ? (
              <span style={{ padding: "1px 5px", borderRadius: 3, background: LABELS.find(l => l.value === label)?.color, color: LABELS.find(l => l.value === label)?.textColor }}>{label}</span>
            ) : (
              <span style={{ color: c.value === "(empty)" ? "var(--text-dim)" : "var(--text-primary)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.value}</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!title} onClick={onClose}>{isEdit ? "Save" : "Create"}</Button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
        <span><kbd>Tab</kbd> switch</span>
        <span><kbd>←→</kbd> chips</span>
        <span><kbd>↵</kbd> edit chip</span>
        <span><kbd>⌘↵</kbd> save body</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </Dialog>
  );
}
