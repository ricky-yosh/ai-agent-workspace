import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
// lucide icons now provided by CopyButton
import { Button, Input, CopyButton, SnippetCard } from "../components/ui";
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { indexing, progress, error, startIndex, cancelIndex } = useCodeIndexing(repoPath);

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
      })
      .catch((err) => {
        console.error("Failed to fetch C4 diagrams:", err);
        setLoading(false);
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
        setConfirmDeleteId(null);
      } catch (err) {
        console.error("Failed to delete C4 diagram:", err);
      }
    },
    [selectedDiagram],
  );

  const handleRenameDiagram = useCallback(
    async (id: string) => {
      const trimmed = renameValue.trim();
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
      setRenamingId(null);
      setRenameValue("");
    },
    [renameValue, selectedDiagram],
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
      <div
        style={{
          padding: 16,
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Loading C4 diagrams...
      </div>
    );
  }

  // Zero state
  if (!selectedDiagram && diagrams.length === 0) {
    return (
      <div
        id="c4-diagram-panel-container"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 16,
          padding: 16,
          color: "var(--text-muted)",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.25, lineHeight: 1 }}>{"\u25C8"}</div>

        {error && (
          <div
            style={{
              background: "var(--danger-subtle)",
              border: "1px solid color-mix(in oklch, var(--danger), transparent 70%)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--danger)",
              maxWidth: 320,
              lineHeight: 1.5,
              wordBreak: "break-word",
            }}
          >
            {error}
          </div>
        )}

        {indexing ? (
          <>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                Indexing codebase
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  maxWidth: 220,
                  lineHeight: 1.4,
                }}
              >
                {progress && progress.total > 0
                  ? `${progress.current} of ${progress.total} files`
                  : "Scanning files..."}
              </div>
            </div>

            <div
              style={{
                width: 240,
                height: 6,
                borderRadius: 3,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width:
                    progress && progress.total > 0
                      ? `${(progress.current / progress.total) * 100}%`
                      : "0%",
                  height: "100%",
                  background: "var(--canvas-accent)",
                  borderRadius: 3,
                  transition: "width 150ms ease",
                }}
              />
            </div>

            <div
              style={{
                fontSize: 11,
                opacity: 0.6,
                maxWidth: 280,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {progress?.file_path || ""}
            </div>

            <Button variant="secondary" size="sm" onClick={cancelIndex}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                No C4 diagrams yet
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  maxWidth: 260,
                  lineHeight: 1.4,
                }}
              >
                Index your codebase to enable generating C4 architecture diagrams with the AI
              </div>
            </div>

            <Button variant="primary" size="md" onClick={startIndex}>
              Index Codebase
            </Button>

            <div
              style={{
                flexShrink: 1,
                minHeight: 0,
                overflow: "auto",
                width: "100%",
                maxWidth: 400,
              }}
            >
              <SnippetCard
                hint="After indexing, ask the AI:"
                copyText={zeroStatePrompt}
              >
                Use the aiaw{" "}
                <span style={{ color: "var(--canvas-accent)" }}>
                  generate_c4_diagram
                </span>{" "}
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
      <div
        id="c4-diagram-panel-container"
        style={{ padding: 8, overflow: "auto", height: "100%", boxSizing: "border-box" }}
      >
        <div
          style={{
            padding: "8px 4px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 4,
          }}
        >
          C4 Diagrams
        </div>
        <AnimatePresence mode="popLayout">
          {diagrams.map((diagram, idx) => (
            <motion.div
              key={diagram.id}
              layout
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.2,
                delay: idx * 0.03,
                ease: [0.2, 0, 0, 1],
              }}
              style={{
                padding: "8px 12px",
                marginBottom: 4,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
              }}
              onClick={() => {
                if (renamingId !== diagram.id) {
                  setSelectedDiagram(diagram);
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {renamingId === diagram.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(v) => setRenameValue(v)}
                    onBlur={() => handleRenameDiagram(diagram.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameDiagram(diagram.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <div style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>
                    {diagram.name}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {new Date(diagram.created_at).toLocaleDateString()}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(diagram.id);
                    setRenameValue(diagram.name);
                  }}
                  title="Rename"
                >
                  &#9998;
                </Button>
                {confirmDeleteId === diagram.id ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDiagram(diagram.id);
                      }}
                    >
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(diagram.id);
                    }}
                    title="Delete"
                  >
                    &#10005;
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  // ── Diagram view ───────────────────────────────────────────────────────

  return (
    <div
      id="c4-diagram-panel-container"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* ── Design tokens ── */}
      <style>{`
        .c4-diagram-panel {
          /* Colors are now provided by the theme system via applyTheme().
             Canvas-specific tokens (--canvas-*) are set in the theme files. */
        }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedDiagram(null)}
          title="Back to list"
        >
          &larr;
        </Button>
        <div style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>
          {selectedDiagram.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
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
        <div
          style={{
            padding: "6px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          <Button variant="ghost" size="sm" onClick={handleBack} style={{ marginRight: 4 }}>
            &larr; Back
          </Button>
          <span
            onClick={navigateToRoot}
            style={{
              color: "var(--canvas-accent)",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            System
          </span>
          {drillPath.map((crumb, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--text-muted)" }}> &gt; </span>
              <span
                onClick={() => navigateToLevel(i + 1)}
                style={{
                  color:
                    i === drillPath.length - 1
                      ? "var(--text-primary)"
                      : "var(--canvas-accent)",
                  cursor: "pointer",
                  fontWeight: i === drillPath.length - 1 ? 600 : 400,
                }}
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
