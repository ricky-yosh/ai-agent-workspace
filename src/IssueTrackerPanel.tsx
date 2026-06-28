import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelContext } from "./PanelContext";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { safeInvoke } from "./safeInvoke";
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

  const bodyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.min(i + 1, issues.length - 1)));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => (i === null ? 0 : Math.max(i - 1, 0)));
          break;
        case "Enter":
          if (focusedIndex !== null) {
            const id = issues[focusedIndex].id;
            setExpandedId((prev) => (prev === id ? null : id));
          }
          break;
        case "Escape":
          if (focusedIndex !== null && expandedId === issues[focusedIndex].id) {
            setExpandedId(null);
          } else {
            setFocusedIndex(null);
          }
          break;
      }
    },
    [issues, focusedIndex, expandedId],
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
      <div
        className="issue-tracker-list"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onBlur={() => setFocusedIndex(null)}
      >
        {issues.map((issue, idx) => (
          <div key={issue.id}>
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(idx, el);
                else rowRefs.current.delete(idx);
              }}
              onClick={() => {
                setExpandedId(expandedId === issue.id ? null : issue.id);
                setFocusedIndex(idx);
              }}
              style={{
                padding: "8px 12px",
                marginBottom: expandedId === issue.id ? 0 : 4,
                borderRadius: expandedId === issue.id ? "6px 6px 0 0" : 6,
                background: "var(--bg-secondary, #252526)",
                border: "1px solid var(--border, #3c3c3c)",
                fontSize: 13,
                cursor: "pointer",
                ...(focusedIndex === idx
                  ? { outline: "2px solid #4d8ef0", outlineOffset: "-2px" }
                  : {}),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ color: "var(--text-muted, #888)", fontWeight: 600, minWidth: 48 }}>
                  #{issue.number}
                </span>
                <span style={{ fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {issue.title}
                </span>
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
              className={expandedId === issue.id && issue.body !== "" ? "issue-body expanded" : "issue-body"}
              style={{
                marginBottom: expandedId === issue.id ? 4 : 0,
                borderRadius: "0 0 6px 6px",
                background: "var(--bg-secondary, #252526)",
                border: "1px solid var(--border, #3c3c3c)",
                borderTop: "none",
                fontSize: 12,
                color: "var(--text-secondary, #aaa)",
              }}
            >
              <div style={{ padding: "8px 12px", whiteSpace: "pre-wrap" }}>{issue.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

registerPanel("issue-tracker", "Issue Tracker", IssueTrackerPanel);

export default IssueTrackerPanel;
