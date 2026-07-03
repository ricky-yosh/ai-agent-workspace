import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelIdentity } from "../PanelContext";
import { safeInvoke } from "../safeInvoke";
import { registerShowDiffHandler } from "../panelActionBridge";
import { parseUnifiedDiff } from "./renderers/DiffRenderer";
import { useVirtualRows } from "./virtualizer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitDiffResult {
  diff: string;
  staged: boolean;
}

type DiffTab = "unstaged" | "staged";

// ---------------------------------------------------------------------------
// useGitDiff hook
// ---------------------------------------------------------------------------

function useGitDiff(sessionId: string, staged: boolean) {
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchDiff = useCallback(() => {
    if (!sessionId) return;

    const thisRequest = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    safeInvoke<GitDiffResult>("get_git_diff", { sessionId, staged })
      .then((result) => {
        if (thisRequest !== requestIdRef.current) return;
        setDiff(result.diff);
        setLoading(false);
      })
      .catch((err) => {
        if (thisRequest !== requestIdRef.current) return;
        setError(typeof err === "string" ? err : String(err));
        setDiff("");
        setLoading(false);
      });
  }, [sessionId, staged]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  return { diff, loading, error, refetch: fetchDiff };
}

// ---------------------------------------------------------------------------
// TabButton component
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px",
        fontSize: 12,
        fontFamily: "inherit",
        background: active ? "var(--accent-color, #0078d4)" : "transparent",
        color: active ? "#fff" : "var(--text-primary, #e0e0e0)",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        transition: "background 150ms",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-hover, #2a2a2a)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Flat diff item for virtualization
// ---------------------------------------------------------------------------

interface FlatFileHeader {
  kind: "file-header";
  filePath: string;
}

interface FlatDiffLine {
  kind: "diff-line";
  raw: string;
}

type FlatItem = FlatFileHeader | FlatDiffLine;

/**
 * Flatten parsed diff files into a linear array of items for virtualization.
 * Each file header becomes a separate item, and each diff line is its own item.
 */
function flattenDiffFiles(files: ReturnType<typeof parseUnifiedDiff>): FlatItem[] {
  const items: FlatItem[] = [];
  for (const file of files) {
    items.push({ kind: "file-header", filePath: file.filePath });
    for (const line of file.lines) {
      items.push({ kind: "diff-line", raw: line.raw });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// DiffViewerPanel component
// ---------------------------------------------------------------------------

function DiffViewerPanel({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelIdentity();
  const [activeTab, setActiveTab] = useState<DiffTab>("unstaged");

  // --- Bridge integration: listen for external show-diff requests ---
  useEffect(() => {
    return registerShowDiffHandler((payload) => {
      if (payload.staged !== undefined) {
        setActiveTab(payload.staged ? "staged" : "unstaged");
      }
    });
  }, []);

  const isStaged = activeTab === "staged";
  const { diff, loading, error, refetch } = useGitDiff(sessionId, isStaged);

  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const totalLines = files.reduce((sum, f) => sum + f.lines.length, 0);
  const flatItems = useMemo(() => flattenDiffFiles(files), [files]);

  const rowStrings = useMemo(() => flatItems.map((item) => {
    if (item.kind === "file-header") return `@@ ${item.filePath}`;
    return item.raw;
  }), [flatItems]);

  const { visibleRows, totalHeight, scrollRef } = useVirtualRows({
    rows: rowStrings,
    rowHeight: 20,
  });

  return (
    <div
      className="diff-viewer-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderBottom: "1px solid var(--border-color, #333)",
          flexShrink: 0,
        }}
      >
        <TabButton
          label="Unstaged"
          active={activeTab === "unstaged"}
          onClick={() => setActiveTab("unstaged")}
        />
        <TabButton
          label="Staged"
          active={activeTab === "staged"}
          onClick={() => setActiveTab("staged")}
        />
        <div style={{ flex: 1 }} />
        <button
          onClick={refetch}
          title="Refresh"
          style={{
            padding: "2px 8px",
            fontSize: 11,
            background: "transparent",
            color: "var(--text-muted, #888)",
            border: "1px solid var(--border-color, #333)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          ↻
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {loading && (
          <div
            style={{
              padding: 16,
              color: "var(--text-muted, #888)",
              fontSize: 13,
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Loading diff…
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 16,
              color: "var(--error, #f48771)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && !diff && (
          <div
            style={{
              padding: 16,
              color: "var(--text-muted, #888)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            No changes to display.
          </div>
        )}

        {!loading && !error && diff && (
          <div
            ref={scrollRef}
            style={{ height: "100%", overflow: "auto" }}
          >
            <div
              className="diff-renderer"
              style={{
                height: totalHeight,
                position: "relative",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 12,
                lineHeight: "20px",
              }}
            >
              {visibleRows.map((vRow) => {
                const item = flatItems[vRow.index];
                if (!item) return null;

                if (item.kind === "file-header") {
                  return (
                    <div
                      key={vRow.index}
                      className="diff-file-header"
                      style={{
                        position: "absolute",
                        top: vRow.index * 20,
                        height: 20,
                        width: "100%",
                        background: "rgba(56, 132, 255, 0.08)",
                        color: "var(--text-muted, #888)",
                        fontWeight: 600,
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 12,
                        borderBottom: "1px solid var(--border-color, #333)",
                      }}
                    >
                      {item.filePath}
                    </div>
                  );
                }

                const raw = item.raw;
                const isAddition = raw.startsWith("+");
                const isDeletion = raw.startsWith("-");
                const isHunkHeader = raw.startsWith("@@");

                let bg = "transparent";
                let signColor = "var(--text-muted, #666)";
                let typeClass = "context";

                if (isAddition) {
                  typeClass = "addition";
                  bg = "rgba(46, 160, 67, 0.15)";
                  signColor = "#3fb950";
                } else if (isDeletion) {
                  typeClass = "deletion";
                  bg = "rgba(248, 81, 73, 0.15)";
                  signColor = "#f85149";
                } else if (isHunkHeader) {
                  typeClass = "hunk-header";
                  bg = "rgba(56, 132, 255, 0.08)";
                }

                const sign = isAddition ? "+" : isDeletion ? "-" : " ";
                const content = isHunkHeader ? raw : (isAddition || isDeletion) ? raw.slice(1) : raw;

                return (
                  <div
                    key={vRow.index}
                    className={`diff-line diff-line--${typeClass}`}
                    style={{
                      position: "absolute",
                      top: vRow.index * 20,
                      height: 20,
                      width: "100%",
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      whiteSpace: "pre",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        minWidth: 16,
                        color: signColor,
                        fontWeight: 600,
                        userSelect: "none",
                        textAlign: "center",
                      }}
                    >
                      {sign}
                    </span>
                    <span style={{ flex: 1, overflow: "hidden" }}>
                      {content}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        style={{
          padding: "2px 8px",
          fontSize: 11,
          color: "var(--text-muted, #888)",
          borderTop: "1px solid var(--border-color, #333)",
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>{totalLines} lines</span>
        <span>{files.length} file{files.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

registerPanel("diff-viewer", "Diff Viewer", DiffViewerPanel);

export default DiffViewerPanel;
