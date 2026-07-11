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

/**
 * Assigns each commit a lane (column) using the standard "lane tracking"
 * algorithm used by Zed, tig and GitKraken.
 *
 * Commits are processed newest-first. We keep a list of active lanes; each lane
 * holds the SHA of the commit it is currently waiting to place (its next
 * expected commit), or `null` when free. For each commit:
 *
 *  1. It takes the leftmost lane already waiting for it. If no lane expects it
 *     (a branch tip / HEAD), it claims the leftmost free lane instead.
 *  2. Any *other* lanes also waiting for it are closed — those are the branches
 *     merging into this commit.
 *  3. Its FIRST parent inherits the same lane (first-parent continuity keeps a
 *     branch's mainline straight in one column). Additional parents each open a
 *     new lane to the side — these are the branch-outs.
 *
 * This is what keeps merge commits on their branch's trunk and pushes the
 * merged-in topic branches out to their own columns, rather than the reverse.
 */
export function computeLanes(commits: CommitTopology[]): CommitPosition[] {
  if (commits.length === 0) return [];

  const positions: CommitPosition[] = [];

  // lanes[i] = sha the lane is waiting to place next, or null if the lane is free.
  const lanes: (string | null)[] = [];
  // Parallel array: the sha that "started" each lane, used for stable coloring.
  const laneBranchSha: (string | null)[] = [];

  const claimFreeLane = (sha: string, branchSha: string): number => {
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === null) {
        lanes[i] = sha;
        laneBranchSha[i] = branchSha;
        return i;
      }
    }
    lanes.push(sha);
    laneBranchSha.push(branchSha);
    return lanes.length - 1;
  };

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];

    // 1. Find the leftmost lane already waiting for this commit.
    let column = lanes.findIndex((l) => l === commit.sha);

    if (column === -1) {
      // Not expected anywhere: a branch tip. Claim a fresh lane, and this
      // commit starts a new branch for coloring purposes.
      column = claimFreeLane(commit.sha, commit.sha);
    }

    const branchSha = laneBranchSha[column] ?? commit.sha;

    // 2. Close any *other* lanes waiting for the same commit (they merge in).
    for (let i = 0; i < lanes.length; i++) {
      if (i !== column && lanes[i] === commit.sha) {
        lanes[i] = null;
        laneBranchSha[i] = null;
      }
    }

    // 3. Route the parents.
    const parents = commit.parent_hashes;
    if (parents.length === 0) {
      // Root commit: the lane ends here.
      lanes[column] = null;
      laneBranchSha[column] = null;
    } else {
      // First parent continues this lane, preserving the branch color.
      lanes[column] = parents[0];
      // Extra parents branch to the side, unless a lane already expects them.
      for (let p = 1; p < parents.length; p++) {
        const parentSha = parents[p];
        if (!lanes.includes(parentSha)) {
          claimFreeLane(parentSha, parentSha);
        }
      }
    }

    positions.push({ sha: commit.sha, column, row, branchSha });
  }

  return positions;
}
