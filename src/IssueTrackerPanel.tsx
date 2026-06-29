import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
  const { sessionId, focusedAreaId, areaId } = usePanelContext();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const bodyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const filterInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (focusedIndex === null) return;
    rowRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  useEffect(() => {
    if (document.activeElement === filterInputRef.current) return;
    if (focusedAreaId === areaId) {
      if (focusedIndex !== null) {
        rowRefs.current.get(focusedIndex)?.focus();
      } else {
        panelRef.current?.focus();
      }
    }
  }, [focusedAreaId, areaId, focusedIndex]);

  useLayoutEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        panelRef.current?.contains(document.activeElement) &&
        document.activeElement !== filterInputRef.current
      ) {
        e.preventDefault();
        e.stopPropagation();
        filterInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onGlobalKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onGlobalKeyDown, { capture: true });
  }, []);

  const moveFocus = useCallback((newIndex: number) => {
    setFocusedIndex(newIndex);
    rowRefs.current.get(newIndex)?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // This handler is delegated on the panel container, so it also receives
      // keydowns that bubble up from the filter input. The input manages its
      // own keys (typing, Escape, ArrowDown), so ignore events originating
      // there to avoid e.g. triggering row typeahead while the user is typing.
      if (e.target === filterInputRef.current) return;
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
          if (focusedIndex !== null) {
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

  // Only replace the whole panel with the loading state on the very first
  // load. Background refetches keep the list mounted so they don't unmount the
  // focused row and steal keyboard focus.
  if (loading && issues.length === 0) {
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
    <div ref={panelRef} className="issue-tracker-panel" tabIndex={0} style={{ padding: 8, overflow: "auto", height: "100%", boxSizing: "border-box" }} onKeyDown={handleKeyDown} onFocus={(e) => { if (e.target === e.currentTarget && focusedIndex === null) { setFocusedIndex(0); rowRefs.current.get(0)?.focus(); } }}>
      <div className="issue-filter-search" onClick={() => filterInputRef.current?.focus()}>
        <Search size={14} className="issue-filter-search-icon" />
        <input
          ref={filterInputRef}
          type="text"
          value={filterQuery}
          onChange={(e) => {
            setFilterQuery(e.target.value);
            setFocusedIndex(null);
          }}
          onMouseDown={() => {
            filterInputRef.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setFilterQuery("");
              setFocusedIndex(null);
              rowRefs.current.get(0)?.focus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (displayedIssues.length > 0) {
                moveFocus(0);
              }
            }
          }}
          onBlur={(e) => {
            if (!panelRef.current?.contains(e.relatedTarget as Node)) {
              setFocusedIndex(null);
            }
          }}
          placeholder="Filter issues… (press /)"
          className="issue-filter-search-input"
        />
        {filterQuery && (
          <span className="issue-filter-count">
            {displayedIssues.length}/{issues.length}
          </span>
        )}
        {filterQuery && (
          <button
            className="issue-filter-clear"
            onClick={() => {
              setFilterQuery("");
              setFocusedIndex(null);
              filterInputRef.current?.focus();
            }}
            aria-label="Clear filter"
            type="button"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div ref={listRef} className="issue-tracker-list">
        {filterQuery && displayedIssues.length === 0 ? (
          <div style={{ padding: "16px 12px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
            No matching issues
          </div>
        ) : (
          <AnimatePresence mode="popLayout" onExitComplete={() => {
            // When any exit animation completes, clean up all removing items
            setRemovingIds((prevRemoving) => {
              if (prevRemoving.size > 0) {
                // Remove all exited items from the issues array
                setIssues((prevIssues) => prevIssues.filter((i) => !prevRemoving.has(i.id)));
                // Mark CDC events as processed
                markEventsProcessed();
              }
              return new Set();
            });
          }}>
            {displayedIssues.map((issue, idx) => {
              const isRemoving = removingIds.has(issue.id);
              const isSelected = isRemoving ? false : expandedId === issue.id;
              const isFocused = isRemoving ? false : focusedIndex === idx;
              const progress = parseTaskProgress(issue.body);
              const rowClass = ["issue-row", isSelected ? "selected" : "", isFocused ? "focused" : ""].filter(Boolean).join(" ");
              const bodyClass = ["issue-body", isSelected && issue.body !== "" ? "expanded" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
              const isHighlighted = highlightedIds.has(issue.id);
              return (
                <motion.div
                  key={issue.id}
                  layout
                  initial={isFirstLoad ? { opacity: 0, y: 8 } : false}
                  animate={{
                    opacity: 1,
                    y: 0,
                    backgroundColor: isHighlighted ? "rgba(77, 142, 240, 0.18)" : undefined,
                    borderColor: isHighlighted ? "rgba(77, 142, 240, 0.25)" : undefined,
                  }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: isFirstLoad ? 0.2 : 0.15,
                    delay: isFirstLoad ? idx * 0.03 : 0,
                    ease: [0.2, 0, 0, 1],
                    layout: { duration: 0.2 },
                  }}
                >
                  <div
                    ref={(el) => {
                      if (el) {
                        rowRefs.current.set(idx, el);
                      } else {
                        rowRefs.current.delete(idx);
                      }
                    }}
                    className={rowClass}
                    tabIndex={(focusedIndex ?? 0) === idx ? 0 : -1}
                    onFocus={() => setFocusedIndex(idx)}
                    onBlur={(e) => {
                      if (!listRef.current?.contains(e.relatedTarget as Node)) {
                        setFocusedIndex(null);
                      }
                    }}
                    onClick={() => {
                      setExpandedId(isSelected ? null : issue.id);
                      moveFocus(idx);
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: "var(--text-muted, #888)", fontWeight: 600, minWidth: 48, fontVariantNumeric: "tabular-nums" }}>
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
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

registerPanel("issue-tracker", "Issue Tracker", IssueTrackerPanel);

export default IssueTrackerPanel;
