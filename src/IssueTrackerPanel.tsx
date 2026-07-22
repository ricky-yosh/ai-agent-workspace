import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { Button, AnimatedListRow, FilterableList } from "./components/ui";
import { Plus } from "lucide-react";
import type { PanelProps } from "./panelRegistry";
import { registerPanel } from "./panelRegistry";
import { usePanelContext } from "./PanelContext";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { safeInvoke } from "./safeInvoke";
import IssueModal from "./IssueModal";
import { IssueBody } from "./components/IssueBody";
import "./IssueTrackerPanel.css";

function labelStyle(label: string): { background: string; color: string } {
  switch (label) {
    case "ready-for-agent":
      return { background: "oklch(0.3 0.05 160)", color: "oklch(0.72 0.13 160)" };
    case "ready-for-human":
      return { background: "oklch(0.28 0.05 245)", color: "oklch(0.68 0.13 245)" };
    case "needs-info":
      return { background: "oklch(0.28 0.05 65)", color: "oklch(0.72 0.13 65)" };
    case "needs-triage":
      return { background: "oklch(0.28 0.05 90)", color: "oklch(0.72 0.13 90)" };
    case "wontfix":
      return { background: "oklch(0.25 0.05 25)", color: "oklch(0.68 0.13 25)" };
    default:
      return { background: "var(--bg-elevated)", color: "var(--text-secondary)" };
  }
}

function IssueStateIcon({ state }: { state: string }) {
  if (state === "open") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="open">
        <circle cx="7" cy="7" r="6" stroke="oklch(0.72 0.13 160)" strokeWidth="1.5" />
        <circle cx="7" cy="7" r="2" fill="oklch(0.72 0.13 160)" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="closed">
      <circle cx="7" cy="7" r="6" stroke="var(--text-muted)" strokeWidth="1.5" />
      <path d="M4.5 7l2 2 3-3" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

interface ChangeEvent {
  id: string;
  session_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  payload_json: string;
  created_at: string;
  processed_at: string | null;
}

function IssueTrackerPanel({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelContext();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [issueModalOpen, setIssueModalOpen] = useState<{ mode: "create" } | { mode: "read"; issue: Issue } | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const bodyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);
  const issuesRef = useRef<Issue[]>([]);
  const prevSnapshotsRef = useRef<Map<string, { title: string; labels: string[]; state: string; body: string }>>(new Map());
  const fetchInFlight = useRef(false);
  const pendingFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProcessedEvents = useRef<string[]>([]);

  const displayedIssues = filterQuery
    ? issues.filter((i) => i.title.toLowerCase().includes(filterQuery.toLowerCase()))
    : issues;

  const fetchIssues = useCallback(() => {
    if (!sessionId) return;
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    setLoading(true);
    safeInvoke<Issue[]>("list_issues", { sessionId })
      .then((data) => {
        // Fetch unprocessed change events for animation
        safeInvoke<ChangeEvent[]>("list_change_events", { sessionId })
          .then((events) => {
            const deleteEvents = events.filter((e) => e.event_type === "deleted");

            if (deleteEvents.length > 0) {
              // Extract deleted issues from event payloads
              // The CDC payload stores labels as a JSON string, so parse it
              const deletedIssues = deleteEvents
                .map((e) => {
                  try {
                    const parsed = JSON.parse(e.payload_json);
                    // Ensure labels is an array (CDC stores it as a JSON string)
                    if (typeof parsed.labels === "string") {
                      try { parsed.labels = JSON.parse(parsed.labels); }
                      catch { parsed.labels = []; }
                    }
                    return parsed as Issue;
                  }
                  catch { return null; }
                })
                .filter(Boolean) as Issue[];

              const deletedIds = new Set(deletedIssues.map((i) => i.id));

              // Merge deleted issues back into the list for exit animation
              // AnimatePresence will animate them out, then onExitComplete removes them
              const mergedIssues = [...data];
              deletedIssues.forEach((di) => {
                if (!mergedIssues.some((i) => i.id === di.id)) {
                  mergedIssues.push(di);
                }
              });

              setRemovingIds(deletedIds);
              setIssues(mergedIssues);
              pendingProcessedEvents.current = deleteEvents.map((e) => e.id);

              // Safety timeout: remove items after animation duration even if onExitComplete doesn't fire
              setTimeout(() => {
                setRemovingIds((prevRemoving) => {
                  if (prevRemoving.size > 0) {
                    setIssues((prevIssues) => prevIssues.filter((i) => !prevRemoving.has(i.id)));
                    markEventsProcessed();
                  }
                  return new Set();
                });
              }, 300);
            } else {
              setIssues(data);
              pendingProcessedEvents.current = [];
            }

            setExpandedId((prev) => (prev && !data.some((i) => i.id === prev) ? null : prev));
            setLoading(false);
            setError(null);

            // Detect updated issues for highlight pulse
            const newHighlighted = new Set<string>();
            data.forEach((issue) => {
              const prev = prevSnapshotsRef.current.get(issue.id);
              if (!prev) return;
              if (
                prev.title !== issue.title ||
                prev.state !== issue.state ||
                prev.body !== issue.body ||
                prev.labels.join(",") !== issue.labels.join(",")
              ) {
                newHighlighted.add(issue.id);
              }
            });
            const newSnapshots = new Map<string, { title: string; labels: string[]; state: string; body: string }>();
            data.forEach((issue) => {
              newSnapshots.set(issue.id, {
                title: issue.title,
                labels: [...issue.labels],
                state: issue.state,
                body: issue.body,
              });
            });
            prevSnapshotsRef.current = newSnapshots;
            if (newHighlighted.size > 0) {
              setHighlightedIds(newHighlighted);
              setTimeout(() => {
                setHighlightedIds(new Set());
              }, 300);
            }

            if (isFirstLoad) {
              setIsFirstLoad(false);
            }

            fetchInFlight.current = false;
          })
          .catch(() => {
            // Fallback: just update issues without animations
            setIssues(data);
            setExpandedId((prev) => (prev && !data.some((i) => i.id === prev) ? null : prev));
            setLoading(false);
            setError(null);
            fetchInFlight.current = false;
          });
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
        fetchInFlight.current = false;
      });
  }, [sessionId, isFirstLoad]);

  // Mark CDC events as processed after exit animations complete
  const markEventsProcessed = useCallback(() => {
    if (pendingProcessedEvents.current.length > 0) {
      pendingProcessedEvents.current.forEach((eid) => {
        safeInvoke("mark_change_event_processed", { eventId: eid }).catch(() => {});
      });
      pendingProcessedEvents.current = [];
    }
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const debouncedFetchIssues = useCallback(() => {
    if (pendingFetchTimer.current) {
      clearTimeout(pendingFetchTimer.current);
    }
    pendingFetchTimer.current = setTimeout(() => {
      fetchIssues();
      pendingFetchTimer.current = null;
    }, 50);
  }, [fetchIssues]);

  useEffect(() => {
    return () => {
      if (pendingFetchTimer.current) {
        clearTimeout(pendingFetchTimer.current);
      }
    };
  }, []);

  useTauriEvent<{ session_id: string }>(
    "issues-changed",
    useCallback((payload) => {
      if (payload.session_id === sessionId) {
        debouncedFetchIssues();
      }
    }, [sessionId, debouncedFetchIssues]),
  );

  useTauriEvent(
    "db-changed",
    useCallback(() => {
      debouncedFetchIssues();
    }, [debouncedFetchIssues]),
  );

  useLayoutEffect(() => {
    bodyRefs.current.forEach((el) => {
      el.style.setProperty("--content-height", el.scrollHeight + "px");
    });
  }, [issues, expandedId]);

  useEffect(() => {
    issuesRef.current = issues;
  }, [issues]);

  const focusPanelUnlessActiveInside = useCallback(() => {
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }
  }, []);

  useLayoutEffect(() => {
    focusPanelUnlessActiveInside();
  }, [focusPanelUnlessActiveInside]);

  useEffect(() => {
    const raf = requestAnimationFrame(focusPanelUnlessActiveInside);
    return () => cancelAnimationFrame(raf);
  }, [focusPanelUnlessActiveInside]);

  // Only replace the whole panel with the loading state on the very first
  // load. Background refetches keep the list mounted so they don't unmount the
  // focused row and steal keyboard focus.
  if (loading && issues.length === 0) {
    return (
      <div className="issue-tracker-panel issue-panel__loading">
        Loading issues…
      </div>
    );
  }

  if (error) {
    return (
      <div className="issue-tracker-panel issue-panel__error">
        {error}
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div ref={panelRef} className="issue-tracker-panel issue-panel__empty" tabIndex={0}>
        <div className="issue-panel__empty-icon">○</div>
        <div>
          <div className="issue-panel__empty-title">No issues yet</div>
          <div className="issue-panel__empty-desc">
            Track tasks, bugs, and feature requests
          </div>
        </div>
        <Button variant="primary" size="md" onClick={() => setIssueModalOpen({ mode: "create" })}>
          <Plus size={14} /> New issue <kbd className="issue-kbd">c</kbd>
        </Button>
        {sessionId && (
          <IssueModal
            open={issueModalOpen !== null}
            onClose={() => setIssueModalOpen(null)}
            sessionId={sessionId}
            issue={issueModalOpen?.mode !== "create" ? issueModalOpen?.issue : undefined}
          />
        )}
      </div>
    );
  }

  return (
    <div ref={panelRef} className="issue-tracker-panel" tabIndex={0}>
      <FilterableList
        items={displayedIssues}
        totalCount={issues.length}
        focusedIndex={focusedIndex}
        onFocusedIndexChange={setFocusedIndex}
        searchQuery={filterQuery}
        onSearchChange={setFilterQuery}
        searchPlaceholder="Filter issues… (press /)"
        createLabel="New issue"
        createKey="c"
        onCreateClick={() => setIssueModalOpen({ mode: "create" })}
        onExitComplete={() => {
          setRemovingIds((prevRemoving) => {
            if (prevRemoving.size > 0) {
              setIssues((prevIssues) => prevIssues.filter((i) => !prevRemoving.has(i.id)));
              markEventsProcessed();
            }
            return new Set();
          });
        }}
        onItemExtraKey={(issue, e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setIssueModalOpen({ mode: "read", issue });
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setExpandedId(issue.id);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            setExpandedId(null);
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const char = e.key.toLowerCase();
            const start = focusedIndex === null ? 0 : focusedIndex + 1;
            const len = displayedIssues.length;
            for (let i = 0; i < len; i++) {
              const idx = (start + i) % len;
              if (displayedIssues[idx].title.toLowerCase().startsWith(char)) {
                setFocusedIndex(idx);
                break;
              }
            }
          }
        }}
        emptyMessage="No issues yet"
        noMatchesMessage="No matching issues"
      >
        {(issue, idx, { isFocused, onFocus, onBlur, setCardRef }) => {
          const isRemoving = removingIds.has(issue.id);
          const isSelected = isRemoving ? false : expandedId === issue.id;
          const progress = parseTaskProgress(issue.body);
          const rowClass = ["issue-row", isSelected ? "selected" : "", isFocused ? "focused" : ""].filter(Boolean).join(" ");
          const bodyClass = ["issue-body", isSelected && issue.body !== "" ? "expanded" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
          const isHighlighted = highlightedIds.has(issue.id);
          return (
            <AnimatedListRow
              key={issue.id}
              isFirstLoad={isFirstLoad}
              index={idx}
              isHighlighted={isHighlighted}
            >
              <div
                ref={(el) => {
                  setCardRef(el);
                }}
                className={rowClass}
                tabIndex={0}
                onFocus={onFocus}
                onBlur={onBlur}
                onClick={() => {
                  setExpandedId(isSelected ? null : issue.id);
                  setFocusedIndex(idx);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setIssueModalOpen({ mode: "read", issue });
                }}
              >
                <div className="issue-row__header">
                  <span className="issue-row__number">
                    #{issue.number}
                  </span>
                  <span className="issue-row__title">
                    {issue.title}
                  </span>
                  {progress !== null && (
                    <span className="issue-row__progress">
                      {progress.done}/{progress.total}
                    </span>
                  )}
                  <IssueStateIcon state={issue.state} />
                </div>
                {issue.labels.length > 0 && (
                  <div className="issue-row__labels">
                    {issue.labels.map((label) => (
                      <span
                        key={label}
                        className="issue-label"
                        style={labelStyle(label)}
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
                <div className="issue-body__content">
                  <IssueBody body={issue.body} />
                </div>
              </div>
            </AnimatedListRow>
          );
        }}
      </FilterableList>

      {sessionId && (
        <IssueModal
          open={issueModalOpen !== null}
          onClose={() => setIssueModalOpen(null)}
          sessionId={sessionId}
          issue={issueModalOpen?.mode !== "create" ? issueModalOpen?.issue : undefined}
        />
      )}
    </div>
  );
}

registerPanel("issue-tracker", "Issue Tracker", IssueTrackerPanel);

export default IssueTrackerPanel;
