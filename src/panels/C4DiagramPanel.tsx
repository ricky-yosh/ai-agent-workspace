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
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nextLevel, assignGridPositions, parseDiagramJson, type C4Diagram, type C4DiagramData, type C4Node, type C4Edge, type C4Group, type DrillEntry } from "./c4/types";
import { useCodeIndexing } from "./c4/useCodeIndexing";
import C4FlowNode from "./c4/C4FlowNode";
import CanvasEdge from "./CanvasEdge";
import CanvasGroupNodeComponent from "./CanvasGroupNodeComponent";
import "./C4DiagramPanel.css";

const nodeTypes = { c4Node: C4FlowNode, canvasGroup: CanvasGroupNodeComponent };
const edgeTypes = { canvasEdge: CanvasEdge };

const GROUP_PADDING = 40;

interface C4DiagramViewProps {
  diagramName: string;
  onExit: () => void;
  copyText: string;
  drillPath: DrillEntry[];
  currentLevel: string;
  nodes: C4Node[];
  edges: C4Edge[];
  groups: C4Group[];
  diagramData: C4DiagramData | null;
  onNodeClick: (nodeId: string) => void;
  onBack: () => void;
  onNavigateRoot: () => void;
  onNavigateLevel: (index: number) => void;
}

function C4DiagramCanvas({
  diagramName,
  onExit,
  copyText,
  drillPath,
  currentLevel,
  nodes,
  edges,
  groups,
  diagramData,
  onNodeClick,
  onBack,
  onNavigateRoot,
  onNavigateLevel,
}: C4DiagramViewProps) {
  const reactFlow = useReactFlow();
  const [zoom, setZoom] = useState(1);

  const flowNodes = useMemo<Node[]>(() => {
    const groupNodes: Node[] = groups.map((g) => {
      const members = nodes.filter((n) => g.node_ids.includes(n.id));
      const minX = Math.min(...members.map((n) => n.x));
      const minY = Math.min(...members.map((n) => n.y));
      const maxX = Math.max(...members.map((n) => n.x + n.width));
      const maxY = Math.max(...members.map((n) => n.y + n.height));
      const hasMembers = members.length > 0;
      return {
        id: g.id,
        type: "canvasGroup",
        position: hasMembers
          ? { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING }
          : { x: 0, y: 0 },
        data: {
          label: g.label,
          memberIds: g.node_ids,
          width: hasMembers ? maxX - minX + GROUP_PADDING * 2 : 200,
          height: hasMembers ? maxY - minY + GROUP_PADDING * 2 : 120,
        },
        draggable: false,
        selectable: false,
        style: { zIndex: -1 },
      };
    });

    const cardNodes: Node[] = nodes.map((n) => ({
      id: n.id,
      type: "c4Node",
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      data: { node: n, diagramData },
      draggable: false,
      connectable: false,
    }));

    return [...groupNodes, ...cardNodes];
  }, [nodes, groups, diagramData]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "canvasEdge",
        label: e.label ?? "",
      })),
    [edges],
  );

  // Re-frame the view whenever the visible level changes (initial load + each drill).
  useEffect(() => {
    const id = requestAnimationFrame(() => reactFlow.fitView({ duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [currentLevel, drillPath.length, reactFlow]);

  return (
    <div id="c4-diagram-panel-container" className="c4-view">
      {/* ── Header ── */}
      <div className="c4-header">
        <Button variant="ghost" size="sm" onClick={onExit} title="Back to list">
          &larr;
        </Button>
        <div className="c4-header__title">{diagramName}</div>
        <div className="c4-header__zoom">
          <span>{Math.round(zoom * 100)}%</span>
          <CopyButton text={copyText} label="Copy" size="sm" />
          <Button variant="ghost" size="sm" onClick={() => reactFlow.fitView({ duration: 200 })}>
            Reset
          </Button>
        </div>
      </div>

      {/* ── Breadcrumb + Back ── */}
      {drillPath.length > 0 && (
        <div className="c4-breadcrumb">
          <Button variant="ghost" size="sm" onClick={onBack} className="c4-breadcrumb__back">
            &larr; Back
          </Button>
          <span onClick={onNavigateRoot} className="c4-breadcrumb__link">
            System
          </span>
          {drillPath.map((crumb, i) => (
            <span key={i} className="c4-breadcrumb__item-wrap">
              <span className="c4-breadcrumb__sep"> &gt; </span>
              <span
                onClick={() => onNavigateLevel(i + 1)}
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
      <div className="c4-canvas-wrapper">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          onNodeClick={(_e, node) => onNodeClick(node.id)}
          onMove={(_e, viewport) => setZoom(viewport.zoom)}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

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

  // Newest snapshot (repo returns diagrams ordered by created_at DESC) is the
  // "current" one; older rows read as archived reference history.
  const currentDiagramId = diagrams[0]?.id;

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
              <div className="c4-empty-state__title">No C4 snapshots yet</div>
              <div className="c4-empty-state__desc">
                Index your codebase, then generate point-in-time C4 architecture snapshots with the AI
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
          title="C4 Snapshots"
          searchQuery={filterQuery}
          onSearchChange={setFilterQuery}
          searchPlaceholder="Filter snapshots… (press /)"
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
          emptyMessage="No C4 snapshots yet"
          noMatchesMessage="No matching snapshots"
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
                <div className="c4-diagram-row__heading">
                  <div className="c4-diagram-row__name">{diagram.name}</div>
                  {diagram.id === currentDiagramId && (
                    <span className="c4-diagram-row__badge">Current</span>
                  )}
                </div>
                <div className="c4-diagram-row__date">
                  Captured {relativeTime(new Date(diagram.created_at))}
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
    <ReactFlowProvider>
      <C4DiagramCanvas
        diagramName={selectedDiagram.name}
        onExit={() => setSelectedDiagram(null)}
        copyText={buildDiagramPrompt()}
        drillPath={drillPath}
        currentLevel={currentLevel}
        nodes={filteredNodes}
        edges={filteredEdges}
        groups={filteredGroups}
        diagramData={diagramData}
        onNodeClick={handleNodeClick}
        onBack={handleBack}
        onNavigateRoot={navigateToRoot}
        onNavigateLevel={navigateToLevel}
      />
    </ReactFlowProvider>
  );
}

registerPanel("c4-diagram", "C4 Diagram", C4DiagramPanel);

export default C4DiagramPanel;
