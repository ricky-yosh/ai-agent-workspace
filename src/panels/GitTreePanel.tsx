import { useState, useEffect, useCallback } from "react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelContext } from "../PanelContext";
import { useViewerRegistry } from "../providers/ViewerRegistryProvider";
import { safeInvoke } from "../safeInvoke";

interface CommitInfo {
  hash: string;
  author_name: string;
  author_email: string;
  date: string;
  message: string;
}

type GroupMode = "author" | "date" | "branch";

interface CommitGroup {
  key: string;
  label: string;
  commits: CommitInfo[];
}

function GitTreePanel({ panelType: _panelType }: PanelProps) {
  const { sessionId, workspaceId: _workspaceId, areaId: _areaId } = usePanelContext();
  const registry = useViewerRegistry();

  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("date");
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    safeInvoke<CommitInfo[]>("search_history", {
      sessionId,
      maxResults: 100,
    })
      .then((data) => {
        setCommits(data);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [sessionId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const grouped = useCallback((): CommitGroup[] => {
    const map = new Map<string, CommitInfo[]>();

    for (const c of commits) {
      let key: string;

      switch (groupMode) {
        case "author":
          key = c.author_name;
          break;
        case "date":
          key = c.date.slice(0, 10);
          break;
        case "branch":
          key = c.message.split(" ")[0].slice(0, 30);
          break;
        default:
          key = "all";
      }

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }

    return Array.from(map.entries()).map(([rawKey, commits]) => {
      let label: string;
      if (groupMode === "date") {
        const d = new Date(commits[0].date);
        label = d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      } else {
        label = rawKey.length > 30 ? rawKey.slice(0, 30) + "..." : rawKey;
      }
      return { key: rawKey, label: `${label} (${commits.length})`, commits };
    });
  }, [commits, groupMode]);

  const relativeDate = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    if (days < 7) return `${days} days ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const handleCommitClick = useCallback((hash: string) => {
    if (!sessionId) return;
    safeInvoke<string>("get_commit_diff", { sessionId, hash })
      .then((diffContent) => {
        registry.dispatchDiffContent(diffContent, hash.slice(0, 7));
      })
      .catch((err) => {
        console.error("Failed to get commit diff:", err);
      });
  }, [sessionId, registry]);

  const handleCommitSelect = useCallback((hash: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      setSelectedHashes(prev => {
        const next = new Set(prev);
        if (next.has(hash)) next.delete(hash);
        else next.add(hash);
        return next;
      });
      e.stopPropagation();
    }
  }, []);

  const handleViewRange = useCallback(() => {
    if (selectedHashes.size !== 2 || !sessionId) return;
    const [hash1, hash2] = Array.from(selectedHashes);
    safeInvoke<string>("get_commit_diff", { sessionId, hashFrom: hash1, hashTo: hash2 })
      .then((diffContent) => {
        registry.dispatchDiffContent(diffContent, `${hash1.slice(0, 7)}..${hash2.slice(0, 7)}`);
      })
      .catch((err) => {
        console.error("Failed to get range diff:", err);
      });
  }, [selectedHashes, sessionId, registry]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const groups = grouped();

  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--panel-bg)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-family, sans-serif)",
      fontSize: 13,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Git History</span>
        <div style={{ display: "flex", gap: 4 }}>
          <select
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
            style={{
              background: "var(--input-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
            }}
          >
            <option value="date">By Date</option>
            <option value="author">By Author</option>
            <option value="branch">By Branch</option>
          </select>
          <button
            onClick={fetchHistory}
            title="Refresh"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              color: "var(--text-primary)",
              fontSize: 11,
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {selectedHashes.size === 2 && (
        <div style={{
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel-hover-bg, rgba(128,128,128,0.05))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 11 }}>
            {Array.from(selectedHashes).map(h => h.slice(0, 7)).join(" .. ")}
          </span>
          <button
            onClick={handleViewRange}
            style={{
              background: "var(--accent-color, #3b82f6)",
              color: "white",
              border: "none",
              borderRadius: 4,
              padding: "2px 10px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            View Diff
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
            Loading commits...
          </div>
        )}
        {error && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-error, #ef4444)" }}>
            {error}
          </div>
        )}
        {!loading && !error && commits.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
            No commits found. Make some commits to see them here.
          </div>
        )}
        {!loading && groups.map((group) => {
          const isExpanded = expandedGroups.has(group.key) || groups.length === 1;
          return (
            <div key={group.key}>
              <div
                onClick={() => toggleGroup(group.key)}
                style={{
                  padding: "6px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  borderBottom: "1px solid var(--border)",
                  background: "var(--panel-header-bg, rgba(128,128,128,0.04))",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {isExpanded ? "▾" : "▸"}
                </span>
                <span style={{ fontWeight: 500, fontSize: 12 }}>{group.label}</span>
              </div>
              {isExpanded && group.commits.map((commit) => {
                const isSelected = selectedHashes.has(commit.hash);
                return (
                  <div
                    key={commit.hash}
                    onClick={(e) => {
                      handleCommitSelect(commit.hash, e);
                      if (!e.shiftKey) {
                        handleCommitClick(commit.hash);
                      }
                    }}
                    style={{
                      padding: "6px 12px 6px 28px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      background: isSelected ? "var(--accent-color, #3b82f6)22" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "var(--panel-hover-bg, rgba(128,128,128,0.08))";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {commit.message}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {commit.hash.slice(0, 7)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--text-muted)" }}>
                      <span>{commit.author_name}</span>
                      <span>{relativeDate(commit.date)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerPanel("git-tree", "Git Tree", GitTreePanel);
