import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelContext } from "./PanelContext";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { safeInvoke } from "./safeInvoke";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./IssueTrackerPanel.css";

function labelStyle(label: string): { background: string; color: string } {
  switch (label) {
    case "ready-for-agent":
      return { background: "#1b3a2a", color: "#4ade80" };
    case "ready-for-human":
      return { background: "#1e3a5f", color: "#60a5fa" };
    case "needs-info":
      return { background: "#3a2e1b", color: "#fb923c" };
    case "needs-triage":
      return { background: "#2e2a1b", color: "#facc15" };
    case "wontfix":
      return { background: "#2e1b1b", color: "#f87171" };
    default:
      return { background: "var(--bg-tertiary, #333)", color: "var(--text-secondary, #aaa)" };
  }
}

function IssueStateIcon({ state }: { state: string }) {
  if (state === "open") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="open">
        <circle cx="7" cy="7" r="6" stroke="#4ade80" strokeWidth="1.5" />
        <circle cx="7" cy="7" r="2" fill="#4ade80" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="closed">
      <circle cx="7" cy="7" r="6" stroke="#888" strokeWidth="1.5" />
      <path d="M4.5 7l2 2 3-3" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function parseTaskProgress(body: string): { total: number; done: number } | null {
  const matches = body.match(/^- \[[ x]\]/gm);
  if (!matches || matches.length === 0) return null;
  const done = matches.filter((m) => m === "- [x]").length;
  return { total: matches.length, done };
}

interface Issue {
  id: string;
  session_id: string;
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  author: string;
  created_at: string;
  updated_at: string;
}

function IssueTrackerPanel({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelContext();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  const bodyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const filterInputRef = useRef<HTMLInputElement>(null);

  const displayedIssues = filterQuery
    ? issues.filter((i) => i.title.toLowerCase().includes(filterQuery.toLowerCase()))
    : issues;

  const fetchIssues = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    safeInvoke<Issue[]>("list_issues", { sessionId })
      .then((data) => {
        setIssues(data);
        if (expandedId && !data.some((i) => i.id === expandedId)) {
          setExpandedId(null);
        }
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [sessionId, expandedId]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  useTauriEvent<{ session_id: string }>(
    "issues-changed",
    useCallback((payload) => {
      if (payload.session_id === sessionId) {
        fetchIssues();
      }
    }, [sessionId, fetchIssues]),
  );

  useLayoutEffect(() => {
    bodyRefs.current.forEach((el) => {
      el.style.setProperty("--content-height", el.scrollHeight + "px");
    });
  }, [issues, expandedId]);

  useEffect(() => {
    if (focusedIndex !== null) {
      rowRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const moveFocus = useCallback((newIndex: number) => {
    setFocusedIndex(newIndex);
    rowRefs.current.get(newIndex)?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveFocus(focusedIndex === null ? 0 : Math.min(focusedIndex + 1, displayedIssues.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          moveFocus(focusedIndex === null ? 0 : Math.max(focusedIndex - 1, 0));
          break;
        case "Home":
          e.preventDefault();
          moveFocus(0);
          break;
        case "End":
          e.preventDefault();
          moveFocus(displayedIssues.length - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (focusedIndex !== null) {
            setExpandedId(displayedIssues[focusedIndex].id);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (focusedIndex !== null && expandedId === displayedIssues[focusedIndex].id) {
            setExpandedId(null);
          }
          break;
        case "Enter":
          if (focusedIndex !== null) {
            const id = displayedIssues[focusedIndex].id;
            setExpandedId((prev) => (prev === id ? null : id));
          }
          break;
        case "Escape":
          if (focusedIndex !== null && expandedId === displayedIssues[focusedIndex]?.id) {
            setExpandedId(null);
          } else {
            setFocusedIndex(null);
          }
          break;
        case "/":
          e.preventDefault();
          filterInputRef.current?.focus();
          break;
        default: {
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const char = e.key.toLowerCase();
            const start = focusedIndex === null ? 0 : focusedIndex + 1;
            const len = displayedIssues.length;
            for (let i = 0; i < len; i++) {
              const idx = (start + i) % len;
              if (displayedIssues[idx].title.toLowerCase().startsWith(char)) {
                moveFocus(idx);
                break;
              }
            }
          }
        }
      }
    },
    [displayedIssues, focusedIndex, expandedId, moveFocus],
  );

  if (loading) {
    return (
      <div className="issue-tracker-panel" style={{ padding: 16, color: "var(--text-muted, #888)", fontSize: 13 }}>
        Loading issues…
      </div>
    );
  }

  if (error) {
    return (
      <div className="issue-tracker-panel" style={{ padding: 16, color: "var(--error, #f48771)", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="issue-tracker-panel" style={{ padding: 16, color: "var(--text-muted, #888)", fontSize: 13 }}>
        No issues yet. Ask the AI to create one.
      </div>
    );
  }

  return (
    <div className="issue-tracker-panel" style={{ padding: 8, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 6 }}>
        <input
          ref={filterInputRef}
          type="text"
          value={filterQuery}
          onChange={(e) => {
            setFilterQuery(e.target.value);
            setFocusedIndex(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilterQuery("");
              setFocusedIndex(null);
              rowRefs.current.get(0)?.focus();
            }
          }}
          placeholder="Filter issues…"
          className="issue-filter-input"
          style={{ width: "100%" }}
        />
      </div>
      <div className="issue-tracker-list">
        {displayedIssues.map((issue, idx) => {
          const isSelected = expandedId === issue.id;
          const isFocused = focusedIndex === idx;
          const progress = parseTaskProgress(issue.body);
          const rowClass = ["issue-row", isSelected ? "selected" : "", isFocused ? "focused" : ""].filter(Boolean).join(" ");
          const bodyClass = ["issue-body", isSelected && issue.body !== "" ? "expanded" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
          return (
            <div key={issue.id}>
              <div
                ref={(el) => {
                  if (el) rowRefs.current.set(idx, el);
                  else rowRefs.current.delete(idx);
                }}
                className={rowClass}
                tabIndex={(focusedIndex ?? 0) === idx ? 0 : -1}
                onFocus={() => setFocusedIndex(idx)}
                onBlur={(e) => {
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
                    setFocusedIndex(null);
                  }
                }}
                onKeyDown={handleKeyDown}
                onClick={() => {
                  setExpandedId(isSelected ? null : issue.id);
                  moveFocus(idx);
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-muted, #888)", fontWeight: 600, minWidth: 48 }}>
                    #{issue.number}
                  </span>
                  <span style={{ fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {issue.title}
                  </span>
                  {progress !== null && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted, #888)",
                        background: "var(--bg-tertiary, #333)",
                        borderRadius: 4,
                        padding: "1px 5px",
                        fontVariantNumeric: "tabular-nums",
                        flexShrink: 0,
                      }}
                    >
                      {progress.done}/{progress.total}
                    </span>
                  )}
                  <IssueStateIcon state={issue.state} />
                </div>
                {issue.labels.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {issue.labels.map((label) => (
                      <span
                        key={label}
                        style={{
                          fontSize: 11,
                          padding: "1px 6px",
                          borderRadius: 4,
                          ...labelStyle(label),
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div
                ref={(el) => {
                  if (el) bodyRefs.current.set(issue.id, el);
                  else bodyRefs.current.delete(issue.id);
                }}
                className={bodyClass}
              >
                <div style={{ padding: "8px 12px" }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ children }) => (
                        <h2 style={{ fontSize: 14, fontWeight: "normal", margin: "6px 0 4px" }}>{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 style={{ fontSize: 13, fontWeight: "normal", margin: "6px 0 4px" }}>{children}</h3>
                      ),
                      code: ({ children, className }) => {
                        const isBlock = Boolean(className);
                        if (isBlock) {
                          return <code style={{ fontFamily: "monospace", fontSize: 11 }}>{children}</code>;
                        }
                        return (
                          <code style={{ background: "rgba(255,255,255,0.08)", borderRadius: 3, padding: "1px 4px", fontFamily: "monospace", fontSize: 11 }}>
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre style={{ background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: 8, overflowX: "auto", fontSize: 11, margin: "4px 0" }}>
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote style={{ borderLeft: "3px solid var(--border, #3c3c3c)", margin: 0, paddingLeft: 10, color: "var(--text-muted, #888)" }}>
                          {children}
                        </blockquote>
                      ),
                      p: ({ children }) => <p style={{ margin: "4px 0" }}>{children}</p>,
                      ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ol>,
                      a: ({ children, href }) => (
                        <a href={href} style={{ color: "#60a5fa", textDecoration: "none" }}>{children}</a>
                      ),
                      input: ({ checked }: React.InputHTMLAttributes<HTMLInputElement>) => (
                        <input type="checkbox" disabled checked={checked ?? false} onChange={() => {}} style={{ accentColor: "#4ade80", cursor: "default", marginRight: 4 }} />
                      ),
                    }}
                  >
                    {issue.body}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerPanel("issue-tracker", "Issue Tracker", IssueTrackerPanel);

export default IssueTrackerPanel;
