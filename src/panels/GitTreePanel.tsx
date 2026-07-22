import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelContext } from "../PanelContext";
import { useViewerRegistry } from "../providers/ViewerRegistryProvider";
import { safeInvoke } from "../safeInvoke";
import { useVirtualizer } from "@tanstack/react-virtual";
import { computeLanes } from "./git/laneAssignment";
import type { CommitTopology, CommitPosition } from "./git/laneAssignment";
import { getBranchColor } from "./git/branchColors";
import { computeGraphLayout, type GraphLayout, type ConnectorData } from "./git/graphLayout";
import { parseNumstatToTree } from "./git/fileTreeParser";
import type { FileTreeEntry } from "./git/fileTreeParser";
import { CommitQuickOpenModal, type CommitQuickMatch } from "./git/CommitQuickOpenModal";
import { LANE_WIDTH, ROW_HEIGHT, Lane, Connector, Dot, HeadRing } from "./git/gitGraphSvg";
import { Button, CopyButton, Select } from "../components/ui";
import { X } from "lucide-react";
import SearchBar from "../components/SearchBar";
import "./GitTreePanel.css";

interface CommitInfo {
  hash: string;
  parent_hashes: string[];
  refs: string[];
  author_name: string;
  author_email: string;
  date: string;
  message: string;
}

interface RowData {
  sha: string;
  column: number;
  row: number;
  color: string;
  hash: string;
  author: string;
  message: string;
  relativeDate: string;
  refLabels: string[];
}

const DEFAULT_WIDTHS = { graphCol: 120, hashCol: 80, authorCol: 140, messageCol: 300, dateCol: 120 };

function statusIcon(status?: string): string {
  switch (status) {
    case "added": return "+";
    case "deleted": return "-";
    case "renamed": return "R";
    default: return "M";
  }
}

function statusColor(status?: string): string {
  switch (status) {
    case "added": return "var(--text-success, #22c55e)";
    case "deleted": return "var(--text-error, #ef4444)";
    case "renamed": return "var(--text-warning, #f59e0b)";
    default: return "var(--text-warning, #f59e0b)";
  }
}

function isIndexSelected(index: number, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  return index >= min && index <= max;
}

function countFiles(entries: FileTreeEntry[]): number {
  return entries.reduce((sum, e) => {
    if (e.kind === "file") return sum + 1;
    return sum + countFiles(e.children || []);
  }, 0);
}

function renderTreeEntries(
  entries: FileTreeEntry[],
  depth: number,
  handleFileClick: (path: string) => void,
): React.ReactNode {
  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((entry) => (
    <div key={entry.path}>
      <div
        onClick={entry.kind === "file" ? () => handleFileClick(entry.path) : undefined}
        className={`git-tree-entry${entry.kind === "file" ? " git-tree-entry--clickable" : ""}${entry.kind === "directory" ? " git-tree-entry--directory" : ""}`}
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        {entry.kind === "file" && (
          <span className="git-tree-entry__icon" style={{ color: statusColor(entry.status) }}>{statusIcon(entry.status)}</span>
        )}
        <span>{entry.kind === "directory" ? `${entry.name}/` : entry.name}</span>
        <span className="git-tree-entry__stats">
          {entry.additions !== undefined && entry.additions > 0 && (
            <span className="git-tree-entry__stats--add">+{entry.additions} </span>
          )}
          {entry.deletions !== undefined && entry.deletions > 0 && (
            <span className="git-tree-entry__stats--del">-{entry.deletions}</span>
          )}
        </span>
      </div>
      {entry.kind === "directory" && entry.children && entry.children.length > 0 && (
        <>{renderTreeEntries(entry.children, depth + 1, handleFileClick)}</>
      )}
    </div>
  ));
}

function relativeDate(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="git-tree-highlight">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function loadColumnWidths(): typeof DEFAULT_WIDTHS {
  try {
    const raw = localStorage.getItem("git-tree-column-widths");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        graphCol: parsed.graphCol ?? DEFAULT_WIDTHS.graphCol,
        hashCol: parsed.hashCol ?? DEFAULT_WIDTHS.hashCol,
        authorCol: parsed.authorCol ?? DEFAULT_WIDTHS.authorCol,
        messageCol: parsed.messageCol ?? DEFAULT_WIDTHS.messageCol,
        dateCol: parsed.dateCol ?? DEFAULT_WIDTHS.dateCol,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_WIDTHS };
}

function saveColumnWidths(widths: typeof DEFAULT_WIDTHS): void {
  try {
    localStorage.setItem("git-tree-column-widths", JSON.stringify(widths));
  } catch {
    // ignore
  }
}

function getRefLabelColor(ref: string): string {
  if (ref.startsWith("tag: ")) return "var(--status-paused)";
  if (ref.startsWith("HEAD -> ")) return "var(--status-running)";
  if (ref.startsWith("refs/heads/")) return "var(--status-running)";
  if (ref.startsWith("refs/tags/")) return "var(--status-paused)";
  if (ref.startsWith("refs/remotes/")) return "var(--accent)";
  return "var(--text-muted)";
}

function shortRefName(ref: string): string {
  if (ref.startsWith("tag: ")) return ref.slice(5);
  if (ref.startsWith("HEAD -> ")) return ref.slice(8);
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
  if (ref.startsWith("refs/remotes/")) return ref.slice("refs/remotes/".length);
  return ref;
}

function GitTreePanel({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelContext();
  const registry = useViewerRegistry();

  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowData[]>([]);
  const detailsCache = useRef<Set<string>>(new Set());
  const pendingFetchRef = useRef<boolean>(false);

  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  const selectedSha =
    selectionStart != null && rows[selectionStart]
      ? rows[selectionStart].sha
      : null;

  const isRangeSelected =
    selectionStart != null && selectionEnd != null && selectionStart !== selectionEnd;

  const selectedRangeShas = useMemo(() => {
    if (selectionStart == null || selectionEnd == null) return [];
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    return rows.slice(start, end + 1).map(r => r.sha);
  }, [selectionStart, selectionEnd, rows]);

  const rangeOldestSha = selectedRangeShas[selectedRangeShas.length - 1];
  const rangeNewestSha = selectedRangeShas[0];
  const [detailPaneOpen, setDetailPaneOpen] = useState(false);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [detailPaneHeight, setDetailPaneHeight] = useState(200);
  const [detailFiles, setDetailFiles] = useState<FileTreeEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fileTreeView, setFileTreeView] = useState<"tree" | "flat">("tree");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState<"keyword" | "author" | "date">("keyword");

  const [colWidths, setColWidths] = useState<typeof DEFAULT_WIDTHS>(loadColumnWidths);

  const saveWidthsRef = useRef(colWidths);
  saveWidthsRef.current = colWidths;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateColWidth = useCallback((col: keyof typeof DEFAULT_WIDTHS, delta: number) => {
    setColWidths((prev) => {
      const next = { ...prev, [col]: Math.max(40, prev[col] + delta) };
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveColumnWidths(next), 300);
      return next;
    });
  }, []);

  const fetchTopology = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    safeInvoke<CommitInfo[]>("get_graph_topology", {
      sessionId,
      maxCount: 500,
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

  const fetchDetails = useCallback(
    (shas: string[]) => {
      if (!sessionId || shas.length === 0) return;
      if (pendingFetchRef.current) return;
      pendingFetchRef.current = true;
      safeInvoke<CommitInfo[]>("get_commit_details", { sessionId, shas })
        .then((data) => {
          const detailMap = new Map(data.map((d) => [d.hash, d]));
          setRows((prev) =>
            prev.map((row) => {
              const detail = detailMap.get(row.sha);
              if (!detail) return row;
              detailsCache.current.add(row.sha);
              return {
                ...row,
                hash: detail.hash.slice(0, 7),
                author: detail.author_name || row.author,
                message: detail.message || row.message,
                relativeDate: detail.date ? relativeDate(detail.date) : row.relativeDate,
                refLabels: detail.refs.length > 0 ? detail.refs : row.refLabels,
              };
            }),
          );
          pendingFetchRef.current = false;
        })
        .catch(() => {
          pendingFetchRef.current = false;
        });
    },
    [sessionId],
  );

  const fetchDetailData = useCallback(
    (hash: string) => {
      if (!sessionId) return;
      setDetailLoading(true);
      safeInvoke<string>("get_diff_numstat", { sessionId, hash })
        .then((data) => {
          const tree = parseNumstatToTree(data);
          setDetailFiles(tree);
          setDetailLoading(false);
        })
        .catch(() => {
          setDetailFiles([]);
          setDetailLoading(false);
        });
    },
    [sessionId],
  );

  const shaToCommitRef = useRef<Map<string, CommitInfo>>(new Map());

  useEffect(() => {
    const map = new Map<string, CommitInfo>();
    for (const c of commits) {
      map.set(c.hash, c);
    }
    shaToCommitRef.current = map;
  }, [commits]);

  const topologyRef = useRef<CommitTopology[]>([]);
  const positionsRef = useRef<CommitPosition[]>([]);
  const shaToPosRef = useRef<Map<string, CommitPosition>>(new Map());
  const rowColorsRef = useRef<string[][]>([]);
  const maxColumnRef = useRef(0);
  const segUpRef = useRef<boolean[][]>([]);
  const segDownRef = useRef<boolean[][]>([]);
  const rowConnectorsRef = useRef<ConnectorData[][]>([]);

  useEffect(() => {
    if (commits.length === 0) {
      setRows([]);
      return;
    }

    const topology: CommitTopology[] = commits.map((c) => ({
      sha: c.hash,
      parent_hashes: c.parent_hashes,
    }));
    topologyRef.current = topology;

    const positions = computeLanes(topology);
    positionsRef.current = positions;

    const shaToPos = new Map<string, CommitPosition>();
    for (const p of positions) {
      shaToPos.set(p.sha, p);
    }
    shaToPosRef.current = shaToPos;

    const layout: GraphLayout = computeGraphLayout(topology, positions);
    maxColumnRef.current = layout.maxColumn;
    segUpRef.current = layout.segUp;
    segDownRef.current = layout.segDown;
    rowColorsRef.current = layout.rowColors;
    rowConnectorsRef.current = layout.rowConnectors;

    const commitShaToRefs = new Map(commits.map(c => [c.hash, c.refs]));
    const commitDetailMap = new Map(commits.map(c => [c.hash, c]));
    const initialRows: RowData[] = positions.map((pos) => {
      const refs = commitShaToRefs.get(pos.sha) || [];
      const detail = commitDetailMap.get(pos.sha);
      return {
        sha: pos.sha,
        column: pos.column,
        row: pos.row,
        color: getBranchColor(pos.branchSha),
        hash: pos.sha.slice(0, 7),
        author: detail?.author_name || "",
        message: detail?.message || "",
        relativeDate: detail?.date ? relativeDate(detail.date) : "",
        refLabels: refs,
      };
    });

    setRows(initialRows);

    const first30 = initialRows.slice(0, 30).map((r) => r.sha);
    fetchDetails(first30);
  }, [commits, fetchDetails]);

  const quickMatches = useMemo(() => {
    return commits.map((c, i) => {
      const color = rows[i]?.color || "#666";
      const matches: CommitQuickMatch[] = [];

      matches.push({
        sha: c.hash,
        source: "sha" as const,
        label: c.message?.split("\n")[0] || "",
        color,
        row: i,
      });

      for (const ref of c.refs) {
        if (ref.startsWith("HEAD ->")) continue;
        if (ref.startsWith("tag: ")) {
          matches.push({
            sha: c.hash,
            source: "tag" as const,
            label: ref.slice(5),
            color,
            row: i,
          });
        } else if (ref.startsWith("refs/heads/") || ref.startsWith("refs/remotes/")) {
          matches.push({
            sha: c.hash,
            source: "branch" as const,
            label: ref.split("/").pop() || ref,
            color,
            row: i,
          });
        }
      }

      return matches;
    }).flat();
  }, [commits, rows]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const visibleItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (rows.length === 0) return;
    const visibleShas = visibleItems.map((vi) => rows[vi.index]?.sha).filter(Boolean) as string[];
    const missingShas = visibleShas.filter((sha) => !detailsCache.current.has(sha));
    if (missingShas.length > 0) {
      fetchDetails(missingShas);
    }
  }, [visibleItems, rows, fetchDetails]);

  const handleCommitClick = useCallback(
    (hash: string) => {
      setDetailPaneOpen(true);
      fetchDetailData(hash);

      if (!sessionId) return;
      safeInvoke<string>("get_commit_diff", { sessionId, hash })
        .then((diffContent) => {
          registry.dispatchDiffContent(diffContent, hash.slice(0, 7));
        })
        .catch((err) => {
          console.error("Failed to get commit diff:", err);
        });
    },
    [sessionId, registry, fetchDetailData],
  );

  const handleDetailFileClick = useCallback(
    (filePath: string) => {
      if (!sessionId || !selectedSha) return;
      safeInvoke<string>("get_file_diff", {
        sessionId,
        hash: selectedSha,
        filePath,
      })
        .then((diffContent) => {
          registry.dispatchDiffContent(diffContent, filePath.split("/").pop() || filePath);
        })
        .catch((err) => console.error("Failed to get file diff:", err));
    },
    [sessionId, selectedSha, registry],
  );

  const handleQuickOpenSelect = useCallback(
    (match: CommitQuickMatch) => {
      setQuickOpenVisible(false);
      setSelectionAnchor(match.row);
      setSelectionStart(match.row);
      setSelectionEnd(match.row);
      virtualizer.scrollToIndex(match.row, { align: "center" });
    },
    [virtualizer],
  );

  const handleQuickOpenClose = useCallback(() => {
    setQuickOpenVisible(false);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (rows.length === 0) return;

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "o") {
        e.preventDefault();
        setQuickOpenVisible(true);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = selectionEnd == null ? 0 : Math.min(selectionEnd + 1, rows.length - 1);
        if (e.shiftKey && selectionAnchor != null) {
          setSelectionStart(Math.min(selectionAnchor, next));
          setSelectionEnd(Math.max(selectionAnchor, next));
        } else {
          setSelectionAnchor(next);
          setSelectionStart(next);
          setSelectionEnd(next);
        }
        virtualizer.scrollToIndex(next, { align: "center" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = selectionEnd == null ? rows.length - 1 : Math.max(selectionEnd - 1, 0);
        if (e.shiftKey && selectionAnchor != null) {
          setSelectionStart(Math.min(selectionAnchor, next));
          setSelectionEnd(Math.max(selectionAnchor, next));
        } else {
          setSelectionAnchor(next);
          setSelectionStart(next);
          setSelectionEnd(next);
        }
        virtualizer.scrollToIndex(next, { align: "center" });
      } else if (e.key === "Enter" && selectionStart != null && selectionEnd != null) {
        e.preventDefault();
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);

        if (start === end) {
          const sha = rows[start]?.sha;
          if (sha) {
            setDetailPaneOpen(true);
            handleCommitClick(sha);
            fetchDetailData(sha);
          }
        } else {
          if (rangeOldestSha && rangeNewestSha && sessionId) {
            safeInvoke<string>("get_commit_diff", {
              sessionId,
              hash_from: rangeOldestSha,
              hash_to: rangeNewestSha,
            })
              .then((diffContent) => {
                const title = `${rangeOldestSha.slice(0, 7)}..${rangeNewestSha.slice(0, 7)}`;
                registry.dispatchDiffContent(diffContent, title);
              })
              .catch((err) => {
                console.error("Failed to get range diff:", err);
              });
          }
        }
      } else if (e.key === "Escape") {
        if (quickOpenVisible) {
          setQuickOpenVisible(false);
          return;
        }
        e.preventDefault();
        setSelectionAnchor(null);
        setSelectionStart(null);
        setSelectionEnd(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        setFileTreeView((prev) => prev === "tree" ? "flat" : "tree");
      }
    };

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [rows, selectionStart, selectionEnd, selectionAnchor, virtualizer, handleCommitClick, rangeOldestSha, rangeNewestSha, sessionId, registry, fetchDetailData]);

  useEffect(() => {
    if (!sessionId) return;
    if (!searchQuery.trim()) {
      fetchTopology();
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      safeInvoke<CommitInfo[]>("search_history", {
        sessionId,
        keyword: searchField === "keyword" ? searchQuery : undefined,
        author: searchField === "author" ? searchQuery : undefined,
        after: searchField === "date" ? searchQuery : undefined,
        maxResults: 500,
      })
        .then((data) => {
          const normalized = data.map((c) => ({
            ...c,
            parent_hashes: c.parent_hashes || [],
            refs: c.refs || [],
          }));
          setCommits(normalized);
          setLoading(false);
        })
        .catch((err) => {
          setError(String(err));
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, searchField, sessionId, fetchTopology]);

  const renderGraphCell = useCallback(
    (rowIndex: number): React.ReactNode => {
      const row = rows[rowIndex];
      if (!row) return null;

      const maxCol = maxColumnRef.current;
      const segUp = segUpRef.current[rowIndex] || [];
      const segDown = segDownRef.current[rowIndex] || [];
      const connectors = rowConnectorsRef.current[rowIndex] || [];
      const rowColors = rowColorsRef.current[rowIndex] || [];
      const svgWidth = (maxCol + 1) * LANE_WIDTH;
      const isHead = row.refLabels.some((ref) => ref.startsWith("HEAD ->"));

      return (
        <svg
          width={svgWidth}
          height={ROW_HEIGHT}
          className="git-tree-graph-svg"
        >
          {Array.from({ length: maxCol + 1 }, (_, col) => (
            <Lane
              key={`col-${col}`}
              column={col}
              up={!!segUp[col]}
              down={!!segDown[col]}
              isDot={col === row.column}
              color={rowColors[col] || "#666"}
            />
          ))}
          {connectors.map((conn, idx) => (
            <Connector
              key={`conn-${idx}`}
              fromCol={conn.fromCol}
              toCol={conn.toCol}
              color={conn.color}
              kind={conn.kind}
            />
          ))}
          <Dot column={row.column} color={row.color} />
          {isHead && <HeadRing column={row.column} color={row.color} />}
        </svg>
      );
    },
    [rows],
  );

  const [resizing, setResizing] = useState<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  const handleResizeStart = useCallback(
    (col: keyof typeof DEFAULT_WIDTHS, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing(col);
      resizeStartXRef.current = e.clientX;
      resizeStartWidthRef.current = saveWidthsRef.current[col];
    },
    [],
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;
      updateColWidth(resizing as keyof typeof DEFAULT_WIDTHS, delta);
      resizeStartXRef.current = e.clientX;
    };

    const handleMouseUp = () => {
      setResizing(null);
      saveColumnWidths(saveWidthsRef.current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, updateColWidth]);

  const renderResizeHandle = (col: keyof typeof DEFAULT_WIDTHS) => (
    <div
      onMouseDown={(e) => handleResizeStart(col, e)}
      className={`git-tree-resize-handle${resizing === col ? " git-tree-resize-handle--active" : ""}`}
    />
  );

  return (
    <div className="git-tree-panel">
      <div className="git-tree-panel__header">
        <span className="git-tree-panel__header-title">Git History</span>
        <Button variant="ghost" size="sm" onClick={fetchTopology} title="Refresh">
          ↻
        </Button>
      </div>

      {/* Search bar */}
      <div className="git-tree-panel__search">
        <div className="git-tree-panel__search-inner">
          <SearchBar
            value={searchQuery}
            onChange={(v) => setSearchQuery(v)}
            placeholder="Filter commits…"
            trailing={
              <>
                <Select
                  variant="minimal"
                  value={searchField}
                  onChange={(v) => setSearchField(v as "keyword" | "author" | "date")}
                  options={[
                    { value: "keyword", label: "Message" },
                    { value: "author", label: "Author" },
                    { value: "date", label: "Date range" },
                  ]}
                />
                {searchQuery && (
                  <span className="git-tree-panel__search-count">
                    {rows.length}
                  </span>
                )}
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear filter"
                  >
                    <X size={12} />
                  </Button>
                )}
              </>
            }
          />
        </div>
      </div>

      <div className="git-tree-panel__column-headers">
        <div className="git-tree-panel__column-header" style={{ width: colWidths.graphCol }}>Graph</div>
        {renderResizeHandle("graphCol")}
        <div className="git-tree-panel__column-header" style={{ width: colWidths.messageCol }}>Description</div>
        {renderResizeHandle("messageCol")}
        <div className="git-tree-panel__column-header" style={{ width: colWidths.dateCol }}>Date</div>
        {renderResizeHandle("dateCol")}
        <div className="git-tree-panel__column-header" style={{ width: colWidths.authorCol }}>Author</div>
        {renderResizeHandle("authorCol")}
        <div className="git-tree-panel__column-header" style={{ width: colWidths.hashCol }}>Hash</div>
        {renderResizeHandle("hashCol")}
      </div>

      <div ref={scrollRef} className="git-tree-panel__scroll-container">
        {loading && (
          <div className="git-tree-panel__state-message">
            Loading commit history...
          </div>
        )}
        {error && (
          <div className="git-tree-panel__state-message git-tree-panel__state-message--error">
            {error}
          </div>
        )}
        {!loading && !error && commits.length === 0 && (
          <div className="git-tree-panel__state-message">
            No commits yet
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div
            className="git-tree-panel__virtual-container"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {visibleItems.map((virtualItem) => {
              const row = rows[virtualItem.index];
              if (!row) return null;
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  onClick={(e) => {
                    if (e.shiftKey && selectionAnchor != null) {
                      setSelectionStart(Math.min(selectionAnchor, virtualItem.index));
                      setSelectionEnd(Math.max(selectionAnchor, virtualItem.index));
                    } else {
                      setSelectionAnchor(virtualItem.index);
                      setSelectionStart(virtualItem.index);
                      setSelectionEnd(virtualItem.index);
                    }
                    handleCommitClick(row.sha);
                  }}
                    className={`git-tree-row${isIndexSelected(virtualItem.index, selectionStart, selectionEnd) ? " git-tree-row--selected" : ""}`}
                    style={{
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                >
                  <div
                    className="git-tree-row__cell--graph"
                    style={{ width: colWidths.graphCol, height: ROW_HEIGHT }}
                  >
                    {renderGraphCell(virtualItem.index)}
                  </div>
                  {renderResizeHandle("graphCol")}
                  <div
                    className="git-tree-row__cell--message"
                    style={{
                      width: colWidths.messageCol,
                      color: row.message ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {row.refLabels.map((ref) => {
                      const refColor = getRefLabelColor(ref);
                      return (
                        <span
                          key={ref}
                          title={shortRefName(ref)}
                          className="git-tree-ref-label"
                          style={{
                            border: `1px solid ${refColor}`,
                            color: refColor,
                            background: `color-mix(in srgb, ${refColor} 15%, transparent)`,
                          }}
                        >
                          {shortRefName(ref)}
                        </span>
                      );
                    })}
                    <span className="git-tree-row__message-text">
                      {searchField === "keyword" && searchQuery.trim()
                        ? highlightMatch(row.message || "", searchQuery)
                        : row.message || "..."}
                    </span>
                  </div>
                  {renderResizeHandle("messageCol")}
                  <div
                    className="git-tree-row__cell--date"
                    style={{ width: colWidths.dateCol }}
                  >
                    {row.relativeDate}
                  </div>
                  {renderResizeHandle("dateCol")}
                  <div
                    className="git-tree-row__cell--author"
                    style={{
                      width: colWidths.authorCol,
                      color: row.author ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {row.author || "..."}
                  </div>
                  {renderResizeHandle("authorCol")}
                  <div className="git-tree-row__cell--hash">
                    {row.hash}
                  </div>
                  {renderResizeHandle("hashCol")}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail pane resize handle */}
      {detailPaneOpen && (
        <div
          className="git-tree-detail__resize-handle"
          onMouseDown={(e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = detailPaneHeight;
            const onMove = (ev: MouseEvent) => {
              const delta = startY - ev.clientY;
              setDetailPaneHeight(Math.max(100, startHeight + delta));
            };
            const onUp = () => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />
      )}

      {/* Commit Detail Pane */}
      {detailPaneOpen && (selectedSha || isRangeSelected) && (
        <div
          className="git-tree-detail__container"
          style={{ height: detailPaneHeight }}
        >
          {/* Header */}
          <div className="git-tree-detail__header">
            <span className="git-tree-detail__header-title">Commit Details</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDetailPaneOpen(false);
                setSelectionAnchor(null);
                setSelectionStart(null);
                setSelectionEnd(null);
              }}
            >
              Close
            </Button>
          </div>

          {/* Content */}
          <div className="git-tree-detail__content">
            {isRangeSelected ? (
              <div className="git-tree-detail__range">
                <div className="git-tree-detail__range-title">
                  Range: {rangeOldestSha?.slice(0, 7)}..{rangeNewestSha?.slice(0, 7)}
                </div>
                <div className="git-tree-detail__range-count">
                  {selectedRangeShas.length} commits selected
                </div>
                <div className="git-tree-detail__range-hint">
                  Press Enter to open combined diff
                </div>
              </div>
            ) : (
              <>
            {/* Full hash with copy */}
            <div className="git-tree-detail__hash-row">
              <span className="git-tree-detail__hash-label">Hash:</span>
              <code className="git-tree-detail__hash-value">
                {selectedSha}
              </code>
              <CopyButton text={selectedSha || ""} label="Copy" />
            </div>

            {/* Author */}
            {(() => {
              const commitData = commits.find((c) => c.hash === selectedSha);
              if (!commitData) return null;
              return (
                <>
                  <div className="git-tree-detail__info-row">
                    <span className="git-tree-detail__info-label">Author: </span>
                    <span className="git-tree-detail__info-value">
                      {commitData.author_name} &lt;{commitData.author_email}&gt;
                    </span>
                  </div>
                  <div className="git-tree-detail__info-row">
                    <span className="git-tree-detail__info-label">Date: </span>
                    <span className="git-tree-detail__info-value">
                      {new Date(commitData.date).toLocaleString()} (
                      {relativeDate(commitData.date)})
                    </span>
                  </div>
                  <div className="git-tree-detail__message">
                    <span className="git-tree-detail__info-label">
                      Message:
                    </span>
                    <div className="git-tree-detail__message-content">
                      {commitData.message}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Files changed */}
            <div className="git-tree-detail__files-section">
              <div className="git-tree-detail__files-header">
                <span className="git-tree-detail__files-header-label">
                  Files changed ({detailFiles.length > 0 ? countFiles(detailFiles) : 0})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFileTreeView((prev) => prev === "tree" ? "flat" : "tree")}
                  title="Ctrl+T"
                >
                  {fileTreeView === "tree" ? "Show flat view" : "Show tree view"}
                </Button>
              </div>
              {detailLoading ? (
                <div className="git-tree-detail__loading">Loading...</div>
              ) : detailFiles.length > 0 ? (
                <div className="git-tree-detail__files-content">
                  {fileTreeView === "tree"
                    ? renderTreeEntries(detailFiles, 0, handleDetailFileClick)
                    : (
                      <div>
                        {detailFiles.map((file) => (
                          <div
                            key={file.path}
                            onClick={() => handleDetailFileClick(file.path)}
                            className="git-tree-detail__file-row"
                          >
                            <span className="git-tree-detail__file-icon" style={{ color: statusColor(file.status) }}>
                              {statusIcon(file.status)}
                            </span>
                            <span className="git-tree-detail__file-path">
                              {file.path.split("/").slice(0, -1).join("/")}
                              {file.path.includes("/") ? "/" : ""}
                            </span>
                            <span className="git-tree-detail__file-name">
                              {file.name}
                            </span>
                            <span className="git-tree-detail__file-stats">
                              {file.additions !== undefined && file.additions > 0 && (
                                <span className="git-tree-detail__file-stats--add">+{file.additions} </span>
                              )}
                              {file.deletions !== undefined && file.deletions > 0 && (
                                <span className="git-tree-detail__file-stats--del">-{file.deletions}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ) : (
                <div className="git-tree-detail__no-files">No file changes</div>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      )}
      {quickOpenVisible && (
        <CommitQuickOpenModal
          matches={quickMatches}
          onSelect={handleQuickOpenSelect}
          onClose={handleQuickOpenClose}
        />
      )}
    </div>
  );
}

registerPanel("git-tree", "Git Tree", GitTreePanel);
