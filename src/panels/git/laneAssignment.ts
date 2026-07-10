export interface CommitTopology {
  sha: string;
  parent_hashes: string[];
}

export interface CommitPosition {
  sha: string;
  column: number;
  row: number;
  branchSha: string;
}

export function computeLanes(commits: CommitTopology[]): CommitPosition[] {
  if (commits.length === 0) return [];

  const positions: CommitPosition[] = [];
  const shaToRow = new Map<string, number>();
  const shaToColumn = new Map<string, number>();
  const columnSegments: { startRow: number; endRow: number; color?: string }[][] = [];
  const columnBranchSha: string[] = [];

  commits.forEach((c, i) => shaToRow.set(c.sha, i));

  const children = new Map<string, string[]>();
  for (const c of commits) {
    for (const p of c.parent_hashes) {
      if (!children.has(p)) children.set(p, []);
      children.get(p)!.push(c.sha);
    }
  }

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    const kids = children.get(commit.sha) || [];
    const childColumns = kids.map(k => shaToColumn.get(k)!).filter(c => c !== undefined);

    let column: number;

    if (kids.length === 0) {
      let foundCol = -1;
      for (let c = 0; c < columnSegments.length; c++) {
        const segs = columnSegments[c];
        if (segs.length === 0 || segs[segs.length - 1].endRow < row) {
          foundCol = c;
          break;
        }
      }
      column = foundCol >= 0 ? foundCol : columnSegments.length;
    } else {
      const isBranchOut = kids.some(childSha => {
        const child = commits[shaToRow.get(childSha)!];
        return child?.parent_hashes[0] === commit.sha;
      });

      if (isBranchOut) {
        column = Math.min(...childColumns);

        for (const childCol of childColumns) {
          if (childCol !== column) {
            const segs = columnSegments[childCol];
            if (segs && segs.length > 0) {
              segs[segs.length - 1].endRow = row - 1;
            }
          }
        }
      } else {
        const maxChildCol = Math.max(...childColumns);
        const minChildRow = Math.min(...kids.map(k => shaToRow.get(k)!));

        let foundCol = -1;
        for (let c = maxChildCol; c < columnSegments.length; c++) {
          const segs = columnSegments[c];
          if (segs.length === 0 || segs[segs.length - 1].endRow < minChildRow) {
            foundCol = c;
            break;
          }
        }

        if (foundCol >= 0) {
          column = foundCol;
        } else {
          column = columnSegments.length;
        }

        for (const childCol of childColumns) {
          const segs = columnSegments[childCol];
          if (segs && segs.length > 0 && segs[segs.length - 1].endRow >= row) {
            segs[segs.length - 1].endRow = row - 1;
          }
        }
      }
    }

    shaToColumn.set(commit.sha, column);

    let branchSha: string;
    if (column < columnBranchSha.length && columnBranchSha[column] !== "") {
      branchSha = columnBranchSha[column];
    } else {
      branchSha = commit.sha;
    }

    if (kids.length === 0) {
      branchSha = commit.sha;
    }

    while (columnBranchSha.length <= column) {
      columnBranchSha.push("");
    }
    columnBranchSha[column] = branchSha;

    while (columnSegments.length <= column) {
      columnSegments.push([]);
    }

    columnSegments[column].push({ startRow: row, endRow: commits.length - 1 });

    positions.push({ sha: commit.sha, column, row, branchSha });
  }

  return positions;
}
