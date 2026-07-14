import { useState, useEffect, useCallback, useMemo } from "react";
import { Edit3, Trash2 } from "lucide-react";
// lucide icons now provided by CopyButton
import { Button, Input, CopyButton, ListCard, FilterableList, SnippetCard, ActionModal } from "../components/ui";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelContext } from "../PanelContext";
import { useSessions } from "../SessionContext";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { safeInvoke } from "../safeInvoke";
import {
  CanvasRenderer,
  type CanvasNode,
} from "../components/CanvasRenderer";

import { nextLevel, assignGridPositions, parseDiagramJson, type C4Diagram, type C4DiagramData, type DrillEntry } from "./c4/types";
import { useCodeIndexing } from "./c4/useCodeIndexing";
import { C4NodeRenderer } from "./c4/C4NodeRenderer";
import "./C4DiagramPanel.css";

function C4DiagramPanel({ panelType: _panelType }: PanelProps) {
  const { sessionId } = usePanelContext();
  const { sessions } = useSessions();
  const session = sessions.find((s) => s.id === sessionId);
  const repoPath = session?.working_directory ?? "";

  const [diagrams, setDiagrams] = useState<C4Diagram[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDiagram, setSelectedDiagram] = useState<C4Diagram | null>(
    null,
  );
  const [diagramData, setDiagramData] = useState<C4DiagramData | null>(null);
  const [currentLevel, setCurrentLevel] = useState<string>("context");
  const [drillPath, setDrillPath] = useState<DrillEntry[]>([]);
  const [editTarget, setEditTarget] = useState<C4Diagram | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  const filteredDiagrams = filterQuery
    ? diagrams.filter((d) => d.name.toLowerCase().includes(filterQuery.toLowerCase()))
    : diagrams;

  const { indexing, progress, error, lastResult, lastIndexedAt, startIndex, cancelIndex } = useCodeIndexing(repoPath);

  const relativeTime = useCallback((date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.round(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    return date.toLocaleDateString();
  }, []);

  // Viewport
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom] = useState(1);

  const [containerWidth, setContainerWidth] = useState(800);

  // ── Copy prompt ───────────────────────────────────────────────────────

  const zeroStatePrompt =
    'Use the aiaw generate_c4_diagram tool to create a C4 diagram of the codebase';

  const buildDiagramPrompt = useCallback((): string => {
    if (!diagramData) return "";
    const lines: string[] = [];
    lines.push(`# C4 Architecture Diagram: ${selectedDiagram?.name ?? "Untitled"}`);
    lines.push("");
    lines.push("## Nodes");
    for (const node of diagramData.nodes) {
      const meta = node.file_path
        ? ` (file: ${node.file_path}${node.line_start ? `:${node.line_start}` : ""})`
        : "";
      lines.push(
        `- ${node.label} [${node.level}/${node.type}]${meta}`,
      );
    }
    lines.push("");
    lines.push("## Relationships");
    for (const edge of diagramData.edges) {
      const source = diagramData.nodes.find((n) => n.id === edge.source_id);
      const target = diagramData.nodes.find((n) => n.id === edge.target_id);
      const sourceLabel = source?.label ?? edge.source_id;
      const targetLabel = target?.label ?? edge.target_id;
      lines.push(
        `- ${sourceLabel} --> ${targetLabel}${edge.label ? ` : ${edge.label}` : ""}`,
      );
    }
    if (diagramData.groups.length > 0) {
      lines.push("");
      lines.push("## Groups");
      for (const group of diagramData.groups) {
        const members = group.node_ids
          .map((id) => diagramData.nodes.find((n) => n.id === id)?.label ?? id)
          .join(", ");
        lines.push(`- ${group.label}: ${members}`);
      }
    }
    return lines.join("\n");
  }, [diagramData, selectedDiagram?.name]);

  // ── Fetch diagrams ────────────────────────────────────────────────────

  const fetchDiagrams = useCallback(() => {
    if (!repoPath) return;
    setLoading(true);
    safeInvoke<C4Diagram[]>("list_c4_diagrams", { repoPath })
      .then((data) => {
        setDiagrams(data);
        setLoading(false);
        setIsFirstLoad(false);
      })
      .catch((err) => {
        console.error("Failed to fetch C4 diagrams:", err);
        setLoading(false);
        setIsFirstLoad(false);
      });
  }, [repoPath]);

  useEffect(() => {
    fetchDiagrams();
  }, [fetchDiagrams]);

  // ── Live refresh on event ──────────────────────────────────────────────

  useTauriEvent<{ repo_path: string }>(
    "c4-diagrams-changed",
    useCallback(
      (payload) => {
        if (payload.repo_path === repoPath) {
          fetchDiagrams();
        }
      },
      [repoPath, fetchDiagrams],
    ),
  );

  useTauriEvent(
    "db-changed",
    useCallback(() => {
      fetchDiagrams();
    }, [fetchDiagrams]),
  );

  // ── Parse diagram data when selected ───────────────────────────────────

  useEffect(() => {
    if (selectedDiagram) {
      const data = parseDiagramJson(selectedDiagram.diagram_json);
      setDiagramData(data);
      setCurrentLevel("context");
      setDrillPath([]);
      setOffsetX(0);
      setOffsetY(0);
      setZoom(1);
    } else {
      setDiagramData(null);
    }
  }, [selectedDiagram]);

  // ── Observe container width for grid positioning ───────────────────────

  useEffect(() => {
    const el = document.getElementById("c4-diagram-panel-container");
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [selectedDiagram, currentLevel]);

  // ── Level filtering ────────────────────────────────────────────────────

  const { filteredNodes, filteredEdges, filteredGroups } = useMemo(() => {
    if (!diagramData) {
      return { filteredNodes: [], filteredEdges: [], filteredGroups: [] };
    }

    const nl = nextLevel(currentLevel);
    const allowedLevels = nl ? [currentLevel, nl] : [currentLevel];

    const visibleNodes = diagramData.nodes.filter((n) =>
      allowedLevels.includes(n.level),
    );
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    const visibleEdges = diagramData.edges.filter(
      (e) =>
        visibleNodeIds.has(e.source_id) && visibleNodeIds.has(e.target_id),
    );

    const visibleGroups = diagramData.groups
      .filter((g) => allowedLevels.includes(g.level))
      .map((g) => ({
        ...g,
        node_ids: g.node_ids.filter((id) => visibleNodeIds.has(id)),
      }))
      .filter((g) => g.node_ids.length > 0);

    const positioned = assignGridPositions(visibleNodes, containerWidth);

    return {
      filteredNodes: positioned,
      filteredEdges: visibleEdges,
      filteredGroups: visibleGroups,
    };
  }, [diagramData, currentLevel, containerWidth]);

  // ── Drill-down ─────────────────────────────────────────────────────────

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (!diagramData) return;
      const node = diagramData.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const nl = nextLevel(node.level);
      if (!nl) return;

      // Find children: nodes whose parent matches this node's label or id
      const children = diagramData.nodes.filter(
        (n) => n.level === nl && (n.parent === node.label || n.parent === node.id),
      );
      if (children.length === 0) return;

      setDrillPath((prev) => [
        ...prev,
        { id: node.id, label: node.label, level: node.level },
      ]);
      setCurrentLevel(nl);
    },
    [diagramData],
  );

  const navigateToRoot = useCallback(() => {
    setDrillPath([]);
    setCurrentLevel("context");
  }, []);

  const navigateToLevel = useCallback((index: number) => {
    setDrillPath((prev) => prev.slice(0, index));
    if (index === 0) {
      setCurrentLevel("context");
    } else {
      setDrillPath((prev) => {
        const newPrev = prev.slice(0, index);
        const last = newPrev[newPrev.length - 1];
        if (last) {
          const nl = nextLevel(last.level);
          if (nl) setCurrentLevel(nl);
        }
        return newPrev;
      });
    }
  }, []);

  const handleBack = useCallback(() => {
    setDrillPath((prev) => {
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        setCurrentLevel("context");
      } else {
        const last = next[next.length - 1];
        const nl = nextLevel(last.level);
        if (nl) setCurrentLevel(nl);
      }
      return next;
    });
  }, []);

  const renderNodeContent = useCallback(
    (node: CanvasNode) => <C4NodeRenderer node={node} diagramData={diagramData} />,
    [diagramData],
  );

  // ── Diagram list actions ───────────────────────────────────────────────

  const handleDeleteDiagram = useCallback(
    async (id: string) => {
      try {
        await safeInvoke("delete_c4_diagram", { id });
        setDiagrams((prev) => prev.filter((d) => d.id !== id));
        if (selectedDiagram?.id === id) {
          setSelectedDiagram(null);
        }
      } catch (err) {
        console.error("Failed to delete C4 diagram:", err);
      }
    },
    [selectedDiagram],
  );

  const handleRenameDiagram = useCallback(
    async (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      try {
        const updated = await safeInvoke<C4Diagram>("rename_c4_diagram", {
          id,
          name: trimmed,
        });
        setDiagrams((prev) =>
          prev.map((d) => (d.id === id ? { ...d, name: updated.name } : d)),
        );
        if (selectedDiagram?.id === id) {
          setSelectedDiagram((prev) =>
            prev ? { ...prev, name: updated.name } : prev,
          );
        }
      } catch (err) {
        console.error("Failed to rename C4 diagram:", err);
      }
    },
    [selectedDiagram],
  );

  // ── Reset view on drill ────────────────────────────────────────────────

  const resetView = useCallback(() => {
    setOffsetX(0);
    setOffsetY(0);
    setZoom(1);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="c4-loading">Loading C4 diagrams...</div>
    );
  }

  // Zero state
  if (!selectedDiagram && diagrams.length === 0) {
    return (
      <div id="c4-diagram-panel-container" className="c4-empty-state">
        <div className="c4-empty-state__icon">{"\u25C8"}</div>

        {error && <div className="c4-error-banner">{error}</div>}

        {indexing ? (
          <>
            <div>
              <div className="c4-indexing__title">Indexing codebase</div>
              <div className="c4-indexing__text">
                {progress && progress.total > 0
                  ? `${progress.current} of ${progress.total} files`
                  : "Scanning files..."}
              </div>
            </div>

            <div className="c4-indexing__progress-track">
              <div
                className="c4-indexing__progress-fill"
                style={{
                  width:
                    progress && progress.total > 0
                      ? `${(progress.current / progress.total) * 100}%`
                      : "0%",
                }}
              />
            </div>

            <div className="c4-indexing__file-path">
              {progress?.file_path || ""}
            </div>

            <Button variant="secondary" size="sm" onClick={cancelIndex}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <div>
              <div className="c4-empty-state__title">No C4 diagrams yet</div>
              <div className="c4-empty-state__desc">
                Index your codebase to enable generating C4 architecture diagrams with the AI
              </div>
            </div>

            {lastResult && lastIndexedAt && (
              <div className="c4-index-status">
                <span className="c4-index-status__dot" />
                Indexed {lastResult.indexed} files{lastResult.skipped > 0 ? ` (${lastResult.skipped} skipped)` : ""} &middot; {relativeTime(lastIndexedAt)}
              </div>
            )}

            <Button variant="primary" size="md" onClick={startIndex}>
              Index Codebase
            </Button>

            <div className="c4-empty-state__snippet-wrap">
              <SnippetCard
                hint="After indexing, ask the AI:"
                copyText={zeroStatePrompt}
              >
                Use the aiaw{" "}
                <span className="c4-accent">generate_c4_diagram</span>{" "}
                tool to create a C4 diagram of the codebase
              </SnippetCard>
            </div>
          </>
        )}
      </div>
    );
  }

  // Diagram list
  if (!selectedDiagram) {
    return (
      <div id="c4-diagram-panel-container" className="c4-list">
        {lastResult && lastIndexedAt && (
          <div className="c4-index-status c4-index-status--list">
            <span className="c4-index-status__dot" />
            Indexed {lastResult.indexed} files{lastResult.skipped > 0 ? ` (${lastResult.skipped} skipped)` : ""} &middot; {relativeTime(lastIndexedAt)}
          </div>
        )}
        <FilterableList
          items={filteredDiagrams}
          focusedIndex={focusedIndex}
          onFocusedIndexChange={setFocusedIndex}
          title="C4 Diagrams"
          searchQuery={filterQuery}
          onSearchChange={setFilterQuery}
          searchPlaceholder="Filter diagrams… (press /)"
          onItemExtraKey={(diagram, e) => {
            if (e.key === "e" || e.key === "E") {
              e.preventDefault();
              setEditTarget(diagram);
            } else if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              setEditTarget(diagram);
            } else if (e.key === "Enter") {
              e.preventDefault();
              setSelectedDiagram(diagram);
            }
          }}
          emptyMessage="No C4 diagrams yet"
          noMatchesMessage="No matching diagrams"
        >
          {(diagram, idx, { isFocused, onFocus, onBlur, setCardRef }) => (
            <ListCard
              key={diagram.id}
              isFirstLoad={isFirstLoad}
              index={idx}
              isFocused={isFocused}
              onFocus={onFocus}
              onBlur={onBlur}
              cardRef={setCardRef}
              onClick={() => setFocusedIndex(idx)}
              onDoubleClick={() => setSelectedDiagram(diagram)}
              onContextMenu={(e) => {
                e.preventDefault();
                setEditTarget(diagram);
              }}
            >
              <div className="c4-diagram-row__inner">
                <div className="c4-diagram-row__name">{diagram.name}</div>
                <div className="c4-diagram-row__date">
                  {new Date(diagram.created_at).toLocaleDateString()}
                </div>
              </div>
            </ListCard>
          )}
        </FilterableList>

        <ActionModal
          open={editTarget !== null}
          onClose={() => setEditTarget(null)}
          title="Edit Diagram"
          initialDraftValue={editTarget?.name ?? ""}
          actions={[
            {
              label: "Rename",
              icon: <Edit3 size={14} />,
              shortcut: "r",
              renderSubPage: ({ value, onChange, onSave }) => (
                <Input
                  autoFocus
                  value={value}
                  onChange={onChange}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter") onSave();
                  }}
                  placeholder="Diagram name"
                />
              ),
              onConfirm: (draftValue) => {
                if (!editTarget || !draftValue) return;
                handleRenameDiagram(editTarget.id, draftValue);
              },
            },
            {
              label: "Delete",
              icon: <Trash2 size={14} />,
              shortcut: "d",
              destructive: true,
              confirmMessage: "Permanently delete this diagram?",
              onConfirm: () => {
                if (!editTarget) return;
                handleDeleteDiagram(editTarget.id);
                setEditTarget(null);
              },
            },
          ]}
        />
      </div>
    );
  }

  // ── Diagram view ───────────────────────────────────────────────────────

  return (
    <div id="c4-diagram-panel-container" className="c4-view">
      {/* ── Header ── */}
      <div className="c4-header">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedDiagram(null)}
          title="Back to list"
        >
          &larr;
        </Button>
        <div className="c4-header__title">{selectedDiagram.name}</div>
        <div className="c4-header__zoom">
          <span>{Math.round(zoom * 100)}%</span>
          <CopyButton
            text={buildDiagramPrompt()}
            label="Copy"
            size="sm"
          />
          <Button variant="ghost" size="sm" onClick={resetView}>
            Reset
          </Button>
        </div>
      </div>

      {/* ── Breadcrumb + Back ── */}
      {drillPath.length > 0 && (
        <div className="c4-breadcrumb">
          <Button variant="ghost" size="sm" onClick={handleBack} className="c4-breadcrumb__back">
            &larr; Back
          </Button>
          <span
            onClick={navigateToRoot}
            className="c4-breadcrumb__link"
          >
            System
          </span>
          {drillPath.map((crumb, i) => (
            <span key={i} className="c4-breadcrumb__item-wrap">
              <span className="c4-breadcrumb__sep"> &gt; </span>
              <span
                onClick={() => navigateToLevel(i + 1)}
                className={
                  i === drillPath.length - 1
                    ? "c4-breadcrumb__item c4-breadcrumb__item--active"
                    : "c4-breadcrumb__item c4-breadcrumb__item--inactive"
                }
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ── Canvas ── */}
      <CanvasRenderer
        nodes={filteredNodes.map((n) => ({
          id: n.id,
          canvas_id: "",
          content: n.label,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          metadata_json: null,
          created_at: "",
          updated_at: "",
        }))}
        edges={filteredEdges.map((e) => ({
          id: e.id,
          canvas_id: "",
          source_node_id: e.source_id,
          target_node_id: e.target_id,
          label: e.label ?? null,
          metadata_json: null,
          created_at: "",
          updated_at: "",
        }))}
        groups={filteredGroups.map((g) => ({
          id: g.id,
          canvas_id: "",
          label: g.label,
          node_ids_json: JSON.stringify(g.node_ids),
          metadata_json: null,
          created_at: "",
          updated_at: "",
        }))}
        mode="read-only"
        offsetX={offsetX}
        offsetY={offsetY}
        zoom={zoom}
        onOffsetChange={(x, y) => {
          setOffsetX(x);
          setOffsetY(y);
        }}
        onZoomChange={setZoom}
        onNodeClick={handleNodeClick}
        renderNodeContent={renderNodeContent}
      />
    </div>
  );
}

registerPanel("c4-diagram", "C4 Diagram", C4DiagramPanel);

export default C4DiagramPanel;
