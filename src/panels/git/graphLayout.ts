import { getBranchColor } from "./branchColors";
import type { CommitTopology, CommitPosition } from "./laneAssignment";

export interface ConnectorData {
  fromCol: number;
  toCol: number;
}

export interface GraphLayout {
  maxColumn: number;
  columnActivity: boolean[][];
  rowColors: string[][];
  rowConnectors: ConnectorData[][];
}

export function computeGraphLayout(
  topology: CommitTopology[],
  positions: CommitPosition[],
): GraphLayout {
  const maxColumn = positions.reduce((m, p) => Math.max(m, p.column), 0);

  const n = positions.length;
  const rowColors: string[][] = Array.from({ length: n }, () =>
    new Array(maxColumn + 1).fill(""),
  );
  const active: boolean[][] = Array.from({ length: n }, () =>
    new Array(maxColumn + 1).fill(false),
  );

  const shaToPos = new Map<string, CommitPosition>();
  for (const p of positions) {
    shaToPos.set(p.sha, p);
  }

  for (const p of positions) {
    active[p.row][p.column] = true;
    rowColors[p.row][p.column] = getBranchColor(p.branchSha);
  }

  for (const c of topology) {
    const pos = shaToPos.get(c.sha);
    if (!pos) continue;

    for (const parentSha of c.parent_hashes) {
      const parentPos = shaToPos.get(parentSha);
      if (!parentPos) continue;
      if (parentPos.column !== pos.column) continue;
      for (let r = pos.row + 1; r < parentPos.row; r++) {
        active[r][pos.column] = true;
        if (!rowColors[r][pos.column]) {
          rowColors[r][pos.column] = getBranchColor(pos.branchSha);
        }
      }
    }
  }

  const rowConnectors: ConnectorData[][] = Array.from({ length: n }, () => []);
  for (const c of topology) {
    const pos = shaToPos.get(c.sha);
    if (!pos) continue;
    for (const parentSha of c.parent_hashes) {
      const parentPos = shaToPos.get(parentSha);
      if (!parentPos) continue;
      if (parentPos.column !== pos.column) {
        rowConnectors[pos.row].push({
          fromCol: pos.column,
          toCol: parentPos.column,
        });
      }
    }
  }

  return { maxColumn, columnActivity: active, rowColors, rowConnectors };
}
