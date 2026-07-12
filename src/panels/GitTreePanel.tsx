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
import { Button, CopyButton } from "../components/ui";
import { X } from "lucide-react";
import SearchBar from "../components/SearchBar";

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
        style={{
          padding: "1px 4px",
          paddingLeft: depth * 16 + 4,
          cursor: entry.kind === "file" ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderRadius: 3,
          color: entry.kind === "directory" ? "var(--text-muted)" : "var(--text-primary)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {entry.kind === "file" && (
          <span style={{ fontSize: 10, color: statusColor(entry.status) }}>{statusIcon(entry.status)}</span>
        )}
        <span>{entry.kind === "directory" ? `${entry.name}/` : entry.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
          {entry.additions !== undefined && entry.additions > 0 && (
            <span style={{ color: "var(--text-success, #22c55e)" }}>+{entry.additions} </span>
          )}
          {entry.deletions !== undefined && entry.deletions > 0 && (
            <span style={{ color: "var(--text-error, #ef4444)" }}>-{entry.deletions}</span>
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
          <span key={i} style={{ background: "color-mix(in oklch, var(--status-paused), transparent 70%)" }}>
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
          style={{ display: "block", flexShrink: 0 }}
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
      style={{
        width: 4,
        cursor: "col-resize",
        flexShrink: 0,
        background: resizing === col ? "var(--accent-color, #3b82f6)" : "transparent",
        transition: resizing === col ? "none" : "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (resizing) return;
        (e.currentTarget as HTMLElement).style.background = "var(--border)";
      }}
      onMouseLeave={(e) => {
        if (resizing) return;
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    />
  );

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-family-sans)",
        fontSize: 13,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>Git History</span>
        <Button variant="ghost" size="sm" onClick={fetchTopology} title="Refresh">
          ↻
        </Button>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SearchBar
            value={searchQuery}
            onChange={(v) => setSearchQuery(v)}
            placeholder="Filter commits…"
            trailing={
              <>
                {/* NOTE: <select> not migrated — no Select primitive exists */}
                <select
                  value={searchField}
                  onChange={(e) =>
                    setSearchField(e.target.value as "keyword" | "author" | "date")
                  }
                  style={{
                    background: "transparent",
                    color: "var(--text-muted)",
                    border: "none",
                    padding: 0,
                    fontSize: 11,
                    cursor: "pointer",
                    appearance: "none",
                    WebkitAppearance: "none",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="keyword">Message</option>
                  <option value="author">Author</option>
                  <option value="date">Date range</option>
                </select>
                {searchQuery && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
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

      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          flexShrink: 0,
        }}
      >
        <div style={{ width: colWidths.graphCol, padding: "4px 8px", flexShrink: 0 }}>Graph</div>
        {renderResizeHandle("graphCol")}
        <div style={{ width: colWidths.messageCol, padding: "4px 8px", flexShrink: 0 }}>Description</div>
        {renderResizeHandle("messageCol")}
        <div style={{ width: colWidths.dateCol, padding: "4px 8px", flexShrink: 0 }}>Date</div>
        {renderResizeHandle("dateCol")}
        <div style={{ width: colWidths.authorCol, padding: "4px 8px", flexShrink: 0 }}>Author</div>
        {renderResizeHandle("authorCol")}
        <div style={{ width: colWidths.hashCol, padding: "4px 8px", flexShrink: 0 }}>Hash</div>
        {renderResizeHandle("hashCol")}
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: "auto",
          position: "relative",
        }}
      >
        {loading && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            Loading commit history...
          </div>
        )}
        {error && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-error, #ef4444)",
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && commits.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            No commits yet
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
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
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualItem.start}px)`,
                      display: "flex",
                      alignItems: "center",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background:
                        isIndexSelected(virtualItem.index, selectionStart, selectionEnd)
                          ? "var(--accent-subtle)"
                          : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isIndexSelected(virtualItem.index, selectionStart, selectionEnd)) {
                        (e.currentTarget as HTMLElement).style.background =
                          "var(--bg-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isIndexSelected(virtualItem.index, selectionStart, selectionEnd)) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }
                    }}
                >
                  <div
                    style={{
                      width: colWidths.graphCol,
                      height: ROW_HEIGHT,
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {renderGraphCell(virtualItem.index)}
                  </div>
                  {renderResizeHandle("graphCol")}
                  <div
                    style={{
                      width: colWidths.messageCol,
                      padding: "0 8px",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      minWidth: 0,
                      color: row.message ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {row.refLabels.map((ref) => {
                      const refColor = getRefLabelColor(ref);
                      return (
                        <span
                          key={ref}
                          title={shortRefName(ref)}
                          style={{
                            fontSize: 11,
                            lineHeight: "16px",
                            padding: "0 6px",
                            borderRadius: 3,
                            border: `1px solid ${refColor}`,
                            color: refColor,
                            background: `color-mix(in srgb, ${refColor} 15%, transparent)`,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                            maxWidth: 140,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {shortRefName(ref)}
                        </span>
                      );
                    })}
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                    >
                      {searchField === "keyword" && searchQuery.trim()
                        ? highlightMatch(row.message || "", searchQuery)
                        : row.message || "..."}
                    </span>
                  </div>
                  {renderResizeHandle("messageCol")}
                  <div
                    style={{
                      width: colWidths.dateCol,
                      padding: "0 8px",
                      flexShrink: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}
                  >
                    {row.relativeDate}
                  </div>
                  {renderResizeHandle("dateCol")}
                  <div
                    style={{
                      width: colWidths.authorCol,
                      padding: "0 8px",
                      flexShrink: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: row.author ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {row.author || "..."}
                  </div>
                  {renderResizeHandle("authorCol")}
                  <div
                    style={{
                      flex: 1,
                      padding: "0 8px",
                      flexShrink: 0,
                      fontFamily: "var(--font-family-mono)",
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
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
          style={{
            height: 4,
            cursor: "ns-resize",
            background: "var(--border)",
            flexShrink: 0,
          }}
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
          style={{
            height: detailPaneHeight,
            flexShrink: 0,
            overflow: "auto",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-panel)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 12 }}>Commit Details</span>
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
          <div style={{ padding: "12px", overflow: "auto", flex: 1 }}>
            {isRangeSelected ? (
              <div style={{ padding: "12px" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                  Range: {rangeOldestSha?.slice(0, 7)}..{rangeNewestSha?.slice(0, 7)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {selectedRangeShas.length} commits selected
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  Press Enter to open combined diff
                </div>
              </div>
            ) : (
              <>
            {/* Full hash with copy */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Hash:</span>
              <code
                style={{
                  fontFamily: "var(--font-family-mono)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  background: "var(--bg-input)",
                  padding: "2px 6px",
                  borderRadius: 3,
                }}
              >
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
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Author: </span>
                    <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
                      {commitData.author_name} &lt;{commitData.author_email}&gt;
                    </span>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Date: </span>
                    <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
                      {new Date(commitData.date).toLocaleString()} (
                      {relativeDate(commitData.date)})
                    </span>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Message:
                    </span>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        marginTop: 2,
                        lineHeight: 1.5,
                      }}
                    >
                      {commitData.message}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Files changed */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
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
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>Loading...</div>
              ) : detailFiles.length > 0 ? (
                <div style={{ fontSize: 12, fontFamily: "var(--font-family-mono)" }}>
                  {fileTreeView === "tree"
                    ? renderTreeEntries(detailFiles, 0, handleDetailFileClick)
                    : (
                      <div>
                        {detailFiles.map((file) => (
                          <div
                            key={file.path}
                            onClick={() => handleDetailFileClick(file.path)}
                            style={{
                              padding: "2px 4px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              borderRadius: 3,
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "transparent";
                            }}
                          >
                            <span style={{ fontSize: 10, color: statusColor(file.status) }}>
                              {statusIcon(file.status)}
                            </span>
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                              {file.path.split("/").slice(0, -1).join("/")}
                              {file.path.includes("/") ? "/" : ""}
                            </span>
                            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                              {file.name}
                            </span>
                            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
                              {file.additions !== undefined && file.additions > 0 && (
                                <span style={{ color: "var(--text-success, #22c55e)" }}>+{file.additions} </span>
                              )}
                              {file.deletions !== undefined && file.deletions > 0 && (
                                <span style={{ color: "var(--text-error, #ef4444)" }}>-{file.deletions}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>No file changes</div>
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
