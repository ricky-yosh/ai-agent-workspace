# Git tree panel: DAG rendering

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/PRD.md` — Git tree panel DAG graph

## What to build

Rewrite the GitTreePanel with the full DAG visualization — SVG graph canvas column alongside text columns — using two-phase data loading and virtual scrolling.

**Replace `src/panels/GitTreePanel.tsx`** with a panel that:

- On mount, calls `get_graph_topology` to fetch SHA + parents + refs
- Passes topology to `computeLanes()` to get column/row positions
- Renders a virtualized list via `@tanstack/react-virtual` with 5 resizable columns:
  1. **Graph Canvas** — SVG column rendering branch lines, commit dots, and ref labels for visible rows only
  2. **Hash** — abbreviated 7-char SHA (monospace)
  3. **Author** — author name
  4. **Message** — first line of commit message
  5. **Date** — relative date ("2 hours ago")
- As rows enter the viewport, lazily calls `get_commit_details` for those SHAs to populate author/date/message
- Uses `getBranchColor(firstSha)` for branch line colors, rendered as `<path>` elements with colored strokes
- Renders ref labels as pill-shaped `<rect>` + `<text>` on branch lines, using `%D` decoration data parsed from topology
- Column widths persist to localStorage, resizable via drag handles between columns
- Shows loading indicator during initial fetch, empty state when no commits exist

**Styling must use the app's design tokens**: CSS variables for fonts (`--font-family`), spacing, colors (`--panel-bg`, `--text-primary`, `--text-muted`, `--border`), matching File Tree, Terminal, and Issue Tracker visual language. No ad-hoc inline numeric values for fonts or spacing.

**Split-pane skeleton**: Reserve space below the list for the Commit Detail Pane (implemented in issue 010). For now, the list takes the full panel height.

## Acceptance criteria

- [ ] Panel appears as "Git Tree" in the panel type selector
- [ ] Graph canvas column shows branch lines, commit dots, and ref labels for the current repo
- [ ] 5 columns visible: Graph Canvas | Hash | Author | Message | Date
- [ ] Columns are resizable via drag handles
- [ ] Column widths persist across panel closes/reopens
- [ ] Two-phase loading: topology appears near-instantly, details fill in for visible rows
- [ ] Virtual scrolling via `@tanstack/react-virtual` — smooth at 1K+ commits
- [ ] Branch lines use deterministic colors from `getBranchColor`
- [ ] Ref labels (branches, tags, remote tracking) shown as colored pills
- [ ] Loading indicator during fetch
- [ ] Empty state when no commits
- [ ] All styling uses app design tokens (CSS variables)
- [ ] `npx tsc --noEmit` passes

## Blocked by

- `008-git-graph-data-layer.md`
- `009-lane-assignment.md`
