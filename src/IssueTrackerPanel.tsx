import { useState, useEffect, useCallback } from "react";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelContext } from "./PanelContext";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { safeInvoke } from "./safeInvoke";

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
      {issues.map((issue) => (
        <div key={issue.id}>
          <div
            onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
            style={{
              padding: "8px 12px",
              marginBottom: expandedId === issue.id ? 0 : 4,
              borderRadius: expandedId === issue.id ? "6px 6px 0 0" : 6,
              background: "var(--bg-secondary, #252526)",
              border: "1px solid var(--border, #3c3c3c)",
              fontSize: 13,
              cursor: "pointer",
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
          {expandedId === issue.id && issue.body && (
            <div
              style={{
                padding: "8px 12px",
                marginBottom: 4,
                borderRadius: "0 0 6px 6px",
                background: "var(--bg-secondary, #252526)",
                border: "1px solid var(--border, #3c3c3c)",
                borderTop: "none",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                color: "var(--text-secondary, #aaa)",
              }}
            >
              {issue.body}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

registerPanel("issue-tracker", "Issue Tracker", IssueTrackerPanel);

export default IssueTrackerPanel;
