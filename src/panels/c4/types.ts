// ── Types ──────────────────────────────────────────────────────────────────

export interface C4Diagram {
  id: string;
  repo_path: string;
  name: string;
  diagram_json: string;
  created_at: string;
  updated_at: string;
}

export interface C4Node {
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

export interface C4Edge {
  id: string;
  source_id: string;
  target_id: string;
  label?: string;
  type?: string;
}

export interface C4Group {
  id: string;
  label: string;
  level: string;
  node_ids: string[];
}

export interface C4DiagramData {
  nodes: C4Node[];
  edges: C4Edge[];
  groups: C4Group[];
}

export interface DrillEntry {
  id: string;
  label: string;
  level: string;
}

export interface IndexProgress {
  phase: string;
  current: number;
  total: number;
  file_path: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function assignGridPositions(
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

export function parseDiagramJson(json: string): C4DiagramData | null {
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

export const LEVEL_ORDER = ["context", "container", "component", "code"] as const;

export function nextLevel(level: string): string | null {
  const idx = LEVEL_ORDER.indexOf(level as (typeof LEVEL_ORDER)[number]);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}
