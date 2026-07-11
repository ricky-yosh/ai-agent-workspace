import { getBranchColor } from "./branchColors";
import type { CommitTopology, CommitPosition } from "./laneAssignment";

export type ConnectorKind = "merge" | "checkout";

export interface ConnectorData {
  fromCol: number;
  toCol: number;
  color: string;
  kind: ConnectorKind;
}

export interface GraphLayout {
  maxColumn: number;
  /** segUp[row][col] — draw the vertical half from the top of the row to the dot line. */
  segUp: boolean[][];
  /** segDown[row][col] — draw the vertical half from the dot line to the bottom of the row. */
  segDown: boolean[][];
  rowColors: string[][];
  rowConnectors: ConnectorData[][];
}

/**
 * Turns commit lane positions into per-row render data.
 *
 * Rather than blanket-filling whole columns (which makes branch tips and bases
 * over-run their endpoints), we walk each parent edge and light up only the
 * exact half-segments the edge occupies:
 *
 *   - same-column edge (a lane continuing straight): the dot leaves downward,
 *     intermediate rows pass straight through, the parent is entered from above.
 *   - cross-column edge (merge second-parent / branch base): a curved connector
 *     leaves the dot at the child row, a straight run fills the parent's column
 *     for the rows in between, and the parent is entered from above.
 *
 * A lane half is drawn only when an edge actually needs it, so a tip has no line
 * above its dot and a base has no line below it — they render as clean stubs.
 */
export function computeGraphLayout(
  topology: CommitTopology[],
  positions: CommitPosition[],
): GraphLayout {
  const maxColumn = positions.reduce((m, p) => Math.max(m, p.column), 0);
  const n = positions.length;
  const width = maxColumn + 1;

  const mk = () => Array.from({ length: n }, () => new Array(width).fill(false));
  const segUp: boolean[][] = mk();
  const segDown: boolean[][] = mk();
  const rowColors: string[][] = Array.from({ length: n }, () =>
    new Array(width).fill(""),
  );
  const rowConnectors: ConnectorData[][] = Array.from({ length: n }, () => []);

  const shaToPos = new Map<string, CommitPosition>();
  for (const p of positions) shaToPos.set(p.sha, p);

  // Dot colors.
  for (const p of positions) {
    rowColors[p.row][p.column] = getBranchColor(p.branchSha);
  }

  const paint = (row: number, col: number, color: string) => {
    if (!rowColors[row][col]) rowColors[row][col] = color;
  };

  for (const c of topology) {
    const pos = shaToPos.get(c.sha);
    if (!pos) continue;

    for (const parentSha of c.parent_hashes) {
      const parentPos = shaToPos.get(parentSha);
      if (!parentPos) continue;

      const cc = pos.column;
      const cp = parentPos.column;
      const rc = pos.row;
      const rp = parentPos.row;
      const laneColor = getBranchColor(parentPos.branchSha);

      if (cc === cp) {
        // Straight lane: dot -> ... -> parent dot, all in one column.
        segDown[rc][cc] = true;
        for (let r = rc + 1; r < rp; r++) {
          segUp[r][cc] = true;
          segDown[r][cc] = true;
          paint(r, cc, laneColor);
        }
        segUp[rp][cc] = true;
      } else if (cc < cp) {
        // Merge edge (main → side lane): connector at the child row,
        // straight run in the parent's column down to the parent dot.
        rowConnectors[rc].push({ fromCol: cc, toCol: cp, color: laneColor, kind: "merge" });
        for (let r = rc + 1; r < rp; r++) {
          segUp[r][cp] = true;
          segDown[r][cp] = true;
          paint(r, cp, laneColor);
        }
        segUp[rp][cp] = true;
      } else {
        // Checkout edge (side lane → main): straight run in the child's
        // column down to one row before the parent, then a checkout
        // connector at the parent's row that curves to the main dot.
        const childColor = getBranchColor(pos.branchSha);
        segDown[rc][cc] = true;
        for (let r = rc + 1; r < rp; r++) {
          segUp[r][cc] = true;
          segDown[r][cc] = true;
          paint(r, cc, childColor);
        }
        segUp[rp][cc] = true;
        paint(rp, cc, childColor);
        rowConnectors[rp].push({ fromCol: cc, toCol: cp, color: childColor, kind: "checkout" });
      }
    }
  }

  return { maxColumn, segUp, segDown, rowColors, rowConnectors };
}
