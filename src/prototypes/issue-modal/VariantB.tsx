// Variant B — Command-line style
// Single prompt at top. Type commands: /title ..., /body ..., /label ...
// Shows a live preview card below. ⌘K focuses prompt.

import { useState, useRef, useEffect } from "react";
import { Dialog } from "../../components/Dialog";
import { Button } from "../../components/ui";
import { Terminal } from "lucide-react";

const LABELS = [
  { value: "needs-triage", color: "oklch(0.28 0.05 90)", textColor: "oklch(0.72 0.13 90)" },
  { value: "ready-for-agent", color: "oklch(0.3 0.05 160)", textColor: "oklch(0.72 0.13 160)" },
  { value: "ready-for-human", color: "oklch(0.28 0.05 245)", textColor: "oklch(0.68 0.13 245)" },
  { value: "needs-info", color: "oklch(0.28 0.05 65)", textColor: "oklch(0.72 0.13 65)" },
  { value: "wontfix", color: "oklch(0.25 0.05 25)", textColor: "oklch(0.68 0.13 25)" },
] as const;

interface Props { open: boolean; onClose: () => void; isEdit?: boolean; }

export default function VariantB({ open, onClose, isEdit }: Props) {
  const [title, setTitle] = useState(isEdit ? "Fix login bug" : "");
  const [body, setBody] = useState(isEdit ? "User reports 500 on /login when email contains a + sign" : "");
  const [label, setLabel] = useState("needs-triage");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setInput(""); inputRef.current?.focus(); } }, [open]);

  function handleCommand(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    setHistory(h => [...h, trimmed]);
    if (trimmed.startsWith("/title ")) setTitle(trimmed.slice(7));
    else if (trimmed.startsWith("/t ")) setTitle(trimmed.slice(3));
    else if (trimmed.startsWith("/body ")) setBody(trimmed.slice(6));
    else if (trimmed.startsWith("/b ")) setBody(trimmed.slice(3));
    else if (trimmed.startsWith("/label ")) {
      const val = trimmed.slice(7).toLowerCase();
      const match = LABELS.find(l => l.value.includes(val) || val.includes(l.value.split("-")[0]));
      if (match) setLabel(match.value);
    } else if (trimmed.startsWith("/l ")) {
      const val = trimmed.slice(3).toLowerCase();
      const match = LABELS.find(l => l.value.includes(val) || val.includes(l.value.split("-")[0]));
      if (match) setLabel(match.value);
    }
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); handleCommand(input); return; }
    if (e.key === "Escape") { if (input) setInput(""); else onClose(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); inputRef.current?.focus(); return; }
  }

  const snippet = title ? `#${isEdit ? "2" : "?"} ${title}` : null;

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Edit Issue" : "New Issue"} onKeyDown={handleKeyDown} width={480}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-primary)", borderRadius: 6, padding: "4px 8px", border: "1px solid var(--border)" }}>
        <Terminal size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="/title ...  /body ...  /label needs-triage" style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text-primary)", fontFamily: "ui-monospace, SF Mono, monospace", fontSize: 12 }} />
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 80, overflowY: "auto", fontSize: 11, fontFamily: "ui-monospace, SF Mono, monospace", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
          {history.map((h, i) => <div key={i}><span style={{ color: "var(--text-dim)" }}>$</span> {h}</div>)}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
        <div style={{ flex: 1, background: "var(--bg-panel)", borderRadius: "var(--radius-island)", padding: 12, boxShadow: "var(--shadow-island)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Issue preview</div>
          {snippet ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
                <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: LABELS.find(l => l.value === label)?.color, color: LABELS.find(l => l.value === label)?.textColor }}>{label}</span>
              </div>
              {body && <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{body}</div>}
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>Type a command to build the issue</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!title} onClick={onClose}>{isEdit ? "Save" : "Create"}</Button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 8 }}>
        <span><kbd>↵</kbd> run</span>
        <span><kbd>/t</kbd> title</span>
        <span><kbd>/b</kbd> body</span>
        <span><kbd>/l</kbd> label</span>
        <span><kbd>⌘K</kbd> focus</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </Dialog>
  );
}
