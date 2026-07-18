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

export interface IndexResult {
  indexed: number;
  skipped: number;
  total: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_LEVELS = new Set(["context", "container", "component", "code"]);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "unnamed";
}

function normalizeNode(raw: Record<string, unknown>, usedIds: Set<string>): C4Node {
  // Derive id from label if missing
  let id: string;
  if (raw.id && typeof raw.id === "string" && raw.id.trim().length > 0) {
    id = raw.id as string;
  } else {
    const base = slugify(String(raw.label ?? "unnamed"));
    id = base;
    let counter = 1;
    while (usedIds.has(id)) {
      id = `${base}-${counter}`;
      counter++;
    }
  }
  usedIds.add(id);

  const level = (raw.level as string) ?? "context";

  return {
    id,
    label: String(raw.label ?? ""),
    level: (VALID_LEVELS.has(level) ? level : "context") as C4Node["level"],
    type: (raw.type as string) ?? "",
    parent: raw.parent as string | undefined,
    file_path: raw.file_path as string | undefined,
    line_start: raw.line_start as number | undefined,
    line_end: raw.line_end as number | undefined,
    children_count: raw.children_count as number | undefined,
    code_snippet: raw.code_snippet as string | undefined,
    metadata: raw.metadata as Record<string, unknown> | undefined,
    x: typeof raw.x === "number" ? raw.x : 0,
    y: typeof raw.y === "number" ? raw.y : 0,
    width: typeof raw.width === "number" ? raw.width : 200,
    height: typeof raw.height === "number" ? raw.height : 100,
  };
}

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
    const rawNodes: Record<string, unknown>[] = parsed.nodes ?? [];
    const usedIds = new Set<string>();
    const nodes = rawNodes.map((raw) => normalizeNode(raw, usedIds));
    return {
      nodes,
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
