import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
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

// ── Types ──────────────────────────────────────────────────────────────────

interface C4Diagram {
  id: string;
  repo_path: string;
  name: string;
  diagram_json: string;
  created_at: string;
  updated_at: string;
}

interface C4Node {
  id: string;
  label: string;
  level: "context" | "container" | "component" | "code";
  type: string;
  parent?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  children_count?: number;
  code_snippet?: string;
  metadata?: Record<string, unknown>;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface C4Edge {
  id: string;
  source_id: string;
  target_id: string;
  label?: string;
  type?: string;
}

interface C4Group {
  id: string;
  label: string;
  level: string;
  node_ids: string[];
}

interface C4DiagramData {
  nodes: C4Node[];
  edges: C4Edge[];
  groups: C4Group[];
}

interface DrillEntry {
  id: string;
  label: string;
  level: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function assignGridPositions(
  nodes: C4Node[],
  containerWidth: number,
): C4Node[] {
  if (nodes.length === 0) return nodes;
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const spacingX = 220;
  const spacingY = 160;
  const startX = Math.max(50, (containerWidth - cols * spacingX) / 2);
  return nodes.map((node, i) => ({
    ...node,
    x: startX + (i % cols) * spacingX,
    y: 50 + Math.floor(i / cols) * spacingY,
    width: 200,
    height: 100,
  }));
}

function parseDiagramJson(json: string): C4DiagramData | null {
  try {
    const parsed = JSON.parse(json);
    return {
      nodes: parsed.nodes ?? [],
      edges: parsed.edges ?? [],
      groups: parsed.groups ?? [],
    };
  } catch {
    return null;
  }
}

const LEVEL_ORDER = ["context", "container", "component", "code"] as const;

function nextLevel(level: string): string | null {
  const idx = LEVEL_ORDER.indexOf(level as (typeof LEVEL_ORDER)[number]);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}

// ── Component ──────────────────────────────────────────────────────────────

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

  // Viewport
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [zoom, setZoom] = useState(1);

  const [containerWidth, setContainerWidth] = useState(800);

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

  // ── Render node content ────────────────────────────────────────────────

  const renderNodeContent = useCallback(
    (node: CanvasNode) => {
      if (!diagramData) return null;
      const c4Node = diagramData.nodes.find((n) => n.id === node.id);
      if (!c4Node) return null;

      if (c4Node.level === "code" && c4Node.code_snippet) {
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--canvas-accent-bright)",
                marginBottom: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {c4Node.label}
            </div>
            <pre
              style={{
                fontSize: 9,
                fontFamily: "var(--font-mono, monospace)",
                color: "var(--text-muted)",
                margin: 0,
                overflow: "hidden",
                whiteSpace: "pre",
                lineHeight: 1.3,
                flex: 1,
              }}
            >
              {c4Node.code_snippet.length > 200
                ? c4Node.code_snippet.slice(0, 200) + "..."
                : c4Node.code_snippet}
            </pre>
          </div>
        );
      }

      const nl = nextLevel(c4Node.level);
      const hasDrillableChildren =
        nl &&
        diagramData.nodes.some(
          (n) =>
            n.level === nl &&
            (n.parent === c4Node.label || n.parent === c4Node.id),
        );

      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              textAlign: "center",
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {c4Node.label}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              textTransform: "capitalize",
            }}
          >
            {c4Node.type || c4Node.level}
          </div>
          {hasDrillableChildren && (
            <div
              style={{
                fontSize: 9,
                color: "var(--canvas-accent)",
                marginTop: 2,
              }}
            >
              Click to drill down
            </div>
          )}
        </div>
      );
    },
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
          padding: 16,
          color: "var(--text-muted)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.4 }}>&#9670;</div>
        <div style={{ fontWeight: 500, fontSize: 14 }}>No C4 diagrams yet.</div>
        <div style={{ maxWidth: 320, lineHeight: 1.5 }}>
          To generate one, ask the AI:
        </div>
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 11,
            color: "var(--text-primary)",
            maxWidth: 400,
            wordBreak: "break-word",
            lineHeight: 1.5,
          }}
        >
          Use the aiaw <code style={{ color: "var(--canvas-accent)" }}>generate_c4_diagram</code>{" "}
          tool to create a C4 diagram of the codebase
        </div>
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
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameDiagram(diagram.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameDiagram(diagram.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      background: "var(--bg-primary)",
                      border: "1px solid var(--canvas-accent)",
                      borderRadius: 4,
                      color: "var(--text-primary)",
                      fontSize: 13,
                      padding: "2px 6px",
                      outline: "none",
                    }}
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(diagram.id);
                    setRenameValue(diagram.name);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px 4px",
                    fontSize: 12,
                  }}
                  title="Rename"
                >
                  &#9998;
                </button>
                {confirmDeleteId === diagram.id ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDiagram(diagram.id);
                      }}
                      style={{
                        background: "var(--danger)",
                        border: "none",
                        color: "var(--text-on-danger)",
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(diagram.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "2px 4px",
                      fontSize: 12,
                    }}
                    title="Delete"
                  >
                    &#10005;
                  </button>
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
        <button
          onClick={() => setSelectedDiagram(null)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
            fontSize: 14,
          }}
          title="Back to list"
        >
          &larr;
        </button>
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
          <button
            onClick={resetView}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 6px",
              fontSize: 11,
            }}
          >
            Reset
          </button>
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
          <button
            onClick={handleBack}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 8px",
              fontSize: 11,
              marginRight: 4,
            }}
          >
            &larr; Back
          </button>
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
