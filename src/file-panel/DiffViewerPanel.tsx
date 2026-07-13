import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelIdentity } from "../PanelContext";
import { safeInvoke } from "../safeInvoke";
import { useViewerRegistry } from "../providers/ViewerRegistryProvider";
import { parseUnifiedDiff } from "./renderers/DiffRenderer";
import { useVirtualRows } from "./virtualizer";
import { Button } from "../components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitDiffResult {
  diff: string;
  staged: boolean;
}

type DiffTab = "unstaged" | "staged";

interface ExternalDiffState {
  content: string;
  title: string;
}

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
    <Button variant={active ? "primary" : "ghost"} size="sm" onClick={onClick}>
      {label}
    </Button>
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
  const registry = useViewerRegistry();
  const [activeTab, setActiveTab] = useState<DiffTab>("unstaged");
  const [externalDiff, setExternalDiff] = useState<ExternalDiffState | null>(null);

  // --- Bridge integration: listen for external show-diff requests ---
  useEffect(() => {
    return registry.registerShowDiffHandler((payload) => {
      if (payload.staged !== undefined) {
        setActiveTab(payload.staged ? "staged" : "unstaged");
      }
    });
  }, [registry]);

  // --- Listen for external diff content (commit diffs, range diffs, etc.) ---
  useEffect(() => {
    function handleOpenDiff(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.content) {
        setExternalDiff({ content: detail.content, title: detail.title ?? "" });
      }
    }
    window.addEventListener("viewer:open-diff-content", handleOpenDiff);
    return () => window.removeEventListener("viewer:open-diff-content", handleOpenDiff);
  }, []);

  const isStaged = activeTab === "staged";
  const { diff, loading, error, refetch } = useGitDiff(sessionId, isStaged);

  const displayDiff = externalDiff?.content ?? diff;

  const files = useMemo(() => parseUnifiedDiff(displayDiff), [displayDiff]);
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
          borderBottom: "1px solid var(--border)",
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
        {externalDiff && (
          <>
            <span style={{ color: "var(--border)", margin: "0 4px" }}>|</span>
            <span
              style={{
                padding: "4px 8px",
                fontSize: 12,
                color: "var(--accent)",
                borderRadius: 4,
                background: "color-mix(in oklch, var(--accent), transparent 90%)",
              }}
            >
              {externalDiff.title}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setExternalDiff(null)}>
              ✕
            </Button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={refetch} title="Refresh">
          ↻
        </Button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {loading && (
          <div
            style={{
              padding: 16,
              color: "var(--text-muted)",
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
              color: "var(--danger)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && !displayDiff && (
          <div
            style={{
              padding: 16,
              color: "var(--text-muted)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            No changes to display.
          </div>
        )}

        {!loading && !error && displayDiff && (
          <div
            ref={scrollRef}
            style={{ height: "100%", overflow: "auto" }}
          >
            <div
              className="diff-renderer"
              style={{
                height: totalHeight,
                position: "relative",
                fontFamily: "var(--font-family-mono)",
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
                        background: "color-mix(in oklch, var(--accent), transparent 92%)",
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 12,
                        borderBottom: "1px solid var(--border)",
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
                let signColor = "var(--text-muted)";
                let typeClass = "context";

                if (isAddition) {
                  typeClass = "addition";
                  bg = "var(--diff-add-bg)";
                  signColor = "var(--diff-add-text)";
                } else if (isDeletion) {
                  typeClass = "deletion";
                  bg = "var(--diff-del-bg)";
                  signColor = "var(--diff-del-text)";
                } else if (isHunkHeader) {
                  typeClass = "hunk-header";
                  bg = "color-mix(in oklch, var(--accent), transparent 92%)";
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
          color: "var(--text-muted)",
          borderTop: "1px solid var(--border)",
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
