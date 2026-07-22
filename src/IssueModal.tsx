import { useState, useEffect, useCallback } from "react";
import { Dialog } from "./components/Dialog";
import {
  Input as UiInput, Textarea as UiTextarea, Badge, Button, Text, Heading,
} from "./components/ui";
import { IssueBody } from "./components/IssueBody";
import { Trash2, Type, AlignLeft, Tag, ChevronLeft, CircleDot, Check, Pencil, Plus } from "lucide-react";
import { safeInvoke } from "./safeInvoke";
import "./IssueModal.css";

const LABELS = [
  { key: "1", value: "needs-triage", bg: "oklch(0.28 0.05 90)", fg: "oklch(0.72 0.13 90)" },
  { key: "2", value: "ready-for-agent", bg: "oklch(0.30 0.05 160)", fg: "oklch(0.72 0.13 160)" },
  { key: "3", value: "ready-for-human", bg: "oklch(0.28 0.05 245)", fg: "oklch(0.72 0.13 245)" },
  { key: "4", value: "needs-info", bg: "oklch(0.28 0.05 65)", fg: "oklch(0.72 0.13 65)" },
  { key: "5", value: "wontfix", bg: "oklch(0.25 0.05 25)", fg: "oklch(0.72 0.13 25)" },
] as const;

interface IssueData {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  author: string;
  created_at: string;
  updated_at: string;
}

interface IssueModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  issue?: IssueData | null;
}

type SubPage = null | "title" | "body" | "label";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function IssueModal({ open, onClose, sessionId, issue }: IssueModalProps) {
  const isEdit = Boolean(issue);
  const [mode, setMode] = useState<"read" | "edit">("edit");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [label, setLabel] = useState("needs-triage");
  const [state, setState] = useState("open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [draftValue, setDraftValue] = useState("");
  const [labelPickerIdx, setLabelPickerIdx] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);

  // Track last-saved values so Esc from edit mode can discard changes
  const [savedTitle, setSavedTitle] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [savedLabel, setSavedLabel] = useState("needs-triage");
  const [savedState, setSavedState] = useState("open");

  useEffect(() => {
    if (open) {
      if (issue) {
        setTitle(issue.title);
        setBody(issue.body);
        const current = LABELS.find((l) => issue.labels.includes(l.value));
        const resolved = current?.value ?? "needs-triage";
        setLabel(resolved);
        setState(issue.state);
        setSavedTitle(issue.title);
        setSavedBody(issue.body);
        setSavedLabel(resolved);
        setSavedState(issue.state);
        setMode("read");
      } else {
        setTitle("");
        setBody("");
        setLabel("needs-triage");
        setState("open");
        setMode("edit");
      }
      setSaving(false);
      setError(null);
      setConfirmingDelete(false);
      setSubPage(null);
      setActiveIdx(0);
    }
  }, [open, issue]);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && issue) {
        await safeInvoke("update_issue", {
          id: issue.id, session_id: sessionId,
          title: trimmedTitle, body: body.trim(),
          labels: [label], state,
        });
        setSavedTitle(trimmedTitle);
        setSavedBody(body.trim());
        setSavedLabel(label);
        setSavedState(state);
        setMode("read");
      } else {
        await safeInvoke("create_issue", {
          sessionId, title: trimmedTitle, body: body.trim(), labels: [label],
        });
        onClose();
      }
      setError(null);
    } catch (err) {
      setError(String(err));
    }
    setSaving(false);
  }, [title, body, label, state, sessionId, isEdit, issue, onClose]);

  const handleDelete = useCallback(async () => {
    if (!issue || !confirmingDelete) return;
    setSaving(true);
    setError(null);
    try {
      await safeInvoke("delete_issue", { id: issue.id, session_id: sessionId });
      onClose();
    } catch (err) {
      setError(String(err));
      setSaving(false);
      setConfirmingDelete(false);
    }
  }, [issue, sessionId, confirmingDelete, onClose]);

  const actions = isEdit
    ? [
        { id: "title" as const, key: "T", icon: Type, label: "Edit title", value: title },
        { id: "body" as const, key: "B", icon: AlignLeft, label: "Edit body", value: body },
        { id: "label" as const, key: "L", icon: Tag, label: "Set label", value: label },
        { id: "state" as const, key: "S", icon: CircleDot, label: "State", value: state },
        { id: "delete" as const, key: "⌫", icon: Trash2, label: confirmingDelete ? "Confirm delete" : "Delete", destructive: true },
        { id: "submit" as const, key: "⌘↵", icon: Check, label: "Save changes" },
      ]
    : [
        { id: "title" as const, key: "T", icon: Type, label: "Set title", value: title || "" },
        { id: "body" as const, key: "B", icon: AlignLeft, label: "Set body", value: body || "" },
        { id: "label" as const, key: "L", icon: Tag, label: "Set label", value: label },
        { id: "submit" as const, key: "⌘↵", icon: Plus, label: "Create issue" },
      ];

  function openSubPage(page: SubPage) {
    if (!page) return;
    if (page === "title") setDraftValue(title);
    if (page === "body") setDraftValue(body);
    if (page === "label") setLabelPickerIdx(LABELS.findIndex(l => l.value === label));
    setSubPage(page);
  }

  function commitSubPage() {
    if (subPage === "title") setTitle(draftValue);
    if (subPage === "body") setBody(draftValue);
    setSubPage(null);
  }

  function triggerAction(a: typeof actions[number]) {
    if (a.id === "delete") {
      if (!confirmingDelete) setConfirmingDelete(true); else handleDelete();
    } else if (a.id === "submit") {
      handleSubmit();
    } else if (a.id === "state") {
      setState(s => s === "open" ? "closed" : "open");
    } else {
      openSubPage(a.id);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // ── Read mode ────────────────────────────────────────────
    if (mode === "read") {
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        setMode("edit");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      return;
    }

    // ── Edit / Create mode ───────────────────────────────────
    if (saving) return;

    if (subPage === "title") {
      if (e.key === "Enter") { e.preventDefault(); commitSubPage(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSubPage(null); return; }
      return;
    }
    if (subPage === "body") {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); commitSubPage(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSubPage(null); return; }
      return;
    }
    if (subPage === "label") {
      switch (e.key) {
        case "ArrowDown": case "ArrowRight": e.preventDefault(); setLabelPickerIdx(i => Math.min(i + 1, LABELS.length - 1)); return;
        case "ArrowUp": case "ArrowLeft": e.preventDefault(); setLabelPickerIdx(i => Math.max(i - 1, 0)); return;
        case "Enter": e.preventDefault(); setLabel(LABELS[labelPickerIdx].value); setSubPage(null); return;
        case "Escape": e.preventDefault(); e.stopPropagation(); setSubPage(null); return;
        default:
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 5) { e.preventDefault(); setLabel(LABELS[num - 1].value); setSubPage(null); }
          }
      }
      return;
    }

    // Action list (not in a sub-page)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, actions.length - 1)); return;
      case "ArrowUp": e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0)); return;
      case "Enter": e.preventDefault();
        triggerAction(actions[activeIdx]); return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        if (mode === "edit" && isEdit) {
          // Discard unsaved changes and return to read mode
          setTitle(savedTitle);
          setBody(savedBody);
          setLabel(savedLabel);
          setState(savedState);
          setMode("read");
        } else {
          onClose();
        }
        return;
      default:
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          const upper = e.key.toUpperCase();
          const a = actions.find(a => a.key === upper);
          if (a) { e.preventDefault(); setActiveIdx(actions.indexOf(a)); triggerAction(a); return; }
        }
    }
  }

  const labelDef = LABELS.find(l => l.value === label) ?? LABELS[0];

  const header = (
    <div className="issue-modal-header">
      <div className="issue-modal-header__left">
        {mode === "read" && issue ? (
          <>
            <CircleDot size={15} />
            <span>Issue #{issue.number}</span>
            <Badge
              variant={state === "open" ? "success" : "default"}
              size="sm"
            >
              {state}
            </Badge>
            {issue.labels.length > 0 && (
              <Badge size="sm" style={{ background: labelDef.bg, color: labelDef.fg }}>
                {issue.labels[0]}
              </Badge>
            )}
          </>
        ) : isEdit && issue ? (
          <>
            <CircleDot size={15} />
            <span>Issue #{issue.number}</span>
          </>
        ) : (
          <span>New Issue</span>
        )}
      </div>
      {mode === "read" && issue && (
        <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>
          <Pencil size={12} />
          Edit
        </Button>
      )}
      {mode === "edit" && isEdit && (
        <Button variant="primary" size="sm" onClick={handleSubmit} loading={saving}>
          <Check size={12} />
          Done
        </Button>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? `Issue #${issue!.number}` : "New Issue"}
      header={header}
      onKeyDown={handleKeyDown}
      width={500}
    >
      {error && <div className="issue-modal-error">{error}</div>}

      {/* ── Read mode ── */}
      {mode === "read" && issue && (
        <div className="issue-modal-read">
          <div className="issue-modal-read__title">
            <Heading level={3}>{title}</Heading>
          </div>
          <div className="issue-modal-read__meta">
            <Text size="sm" color="muted">
              Author: {issue.author}
            </Text>
            <Text size="sm" color="muted">
              Created: {formatDate(issue.created_at)}
            </Text>
            <Text size="sm" color="muted">
              Updated: {formatDate(issue.updated_at)}
            </Text>
          </div>
          {body && (
            <>
              <div className="issue-modal-read__separator" />
              <div className="issue-body__content">
                <IssueBody body={body} />
              </div>
            </>
          )}
          <div className="issue-modal-hints">
            <span className="issue-modal-hint"><kbd>e</kbd> edit</span>
            <span className="issue-modal-hint"><kbd>Esc</kbd> close</span>
          </div>
        </div>
      )}

      {/* ── Title sub-page ── */}
      {subPage === "title" && (
        <div>
          <div className="issue-modal-subhead">
            <button className="issue-modal-back" onClick={() => setSubPage(null)}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
          <UiInput value={draftValue} onChange={v => setDraftValue(v)}
            placeholder="Brief description of the issue"
            autoFocus />
          <div className="issue-modal-hints">
            <span className="issue-modal-hint"><kbd>↵</kbd> save</span>
            <span className="issue-modal-hint"><kbd>Esc</kbd> back</span>
          </div>
        </div>
      )}

      {/* ── Body sub-page ── */}
      {subPage === "body" && (
        <div>
          <div className="issue-modal-subhead">
            <button className="issue-modal-back" onClick={() => setSubPage(null)}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
          <UiTextarea value={draftValue} onChange={v => setDraftValue(v)}
            placeholder="Add details, steps to reproduce, or notes (Markdown supported)"
            rows={8}
            autoFocus />
          <div className="issue-modal-hints">
            <span className="issue-modal-hint"><kbd>⌘↵</kbd> save</span>
            <span className="issue-modal-hint"><kbd>Esc</kbd> back</span>
          </div>
        </div>
      )}

      {/* ── Label sub-page ── */}
      {subPage === "label" && (
        <div>
          <div className="issue-modal-subhead">
            <button className="issue-modal-back" onClick={() => setSubPage(null)}>
              <ChevronLeft size={14} /> Back
            </button>
            <span>— choose a triage label</span>
          </div>
          <div className="issue-modal-list">
            {LABELS.map((l, i) => (
              <div key={l.value}
                className={`issue-modal-item${i === labelPickerIdx ? " issue-modal-item--active" : ""}`}
                onClick={() => { setLabel(l.value); setSubPage(null); }}
                onMouseEnter={() => setLabelPickerIdx(i)}>
                <span className="issue-modal-picker-idx">{l.key}</span>
                <span className="issue-modal-picker-pill" style={{ background: l.bg, color: l.fg, fontWeight: label === l.value ? 600 : 400 }}>{l.value}</span>
                {label === l.value && <span className="issue-modal-picker-current">current</span>}
              </div>
            ))}
          </div>
          <div className="issue-modal-hints">
            <span className="issue-modal-hint"><kbd>↑↓</kbd> or <kbd>1-5</kbd> pick</span>
            <span className="issue-modal-hint"><kbd>↵</kbd> select</span>
            <span className="issue-modal-hint"><kbd>Esc</kbd> back</span>
          </div>
        </div>
      )}

      {/* ── Main action list (edit/create mode, no sub-page) ── */}
      {!subPage && mode !== "read" && (
        <div>
          <div className="issue-modal-list">
            {actions.map((a, i) => (
              <div key={a.id}
                className={`issue-modal-item${i === activeIdx ? " issue-modal-item--active" : ""}${a.destructive ? " issue-modal-item--destructive" : ""}`}
                onClick={() => { setActiveIdx(i); triggerAction(a); }}
                onMouseEnter={() => setActiveIdx(i)}>
                {a.id === "submit" && saving
                  ? <span className="issue-modal-spinner" aria-hidden="true" />
                  : <a.icon size={14} />}
                <span className="issue-modal-item-body">
                  {a.id === "state" ? (
                    <span>State: {state} → {state === "open" ? "closed" : "open"}</span>
                  ) : a.id === "label" ? (
                    <span className="issue-modal-item-label">
                      <span>{a.label}</span>
                      <span className="issue-modal-pill" style={{ background: labelDef.bg, color: labelDef.fg }}>{label}</span>
                    </span>
                  ) : a.id === "submit" || a.id === "delete" ? (
                    <span>{a.label}</span>
                  ) : a.value ? (
                    <span>{a.value}</span>
                  ) : (
                    <span className="issue-modal-item-empty">(empty)</span>
                  )}
                </span>
                <kbd className="issue-modal-item-key">{a.key}</kbd>
              </div>
            ))}
          </div>
          <div className="issue-modal-hints">
            <span className="issue-modal-hint"><kbd>↑↓</kbd> nav</span>
            <span className="issue-modal-hint"><kbd>↵</kbd> select</span>
            <span className="issue-modal-hint"><kbd>⌘↵</kbd> {isEdit ? "save" : "create"}</span>
            <span className="issue-modal-hint"><kbd>Esc</kbd> {isEdit ? "back to read" : "cancel"}</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}
