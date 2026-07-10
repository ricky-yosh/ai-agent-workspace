# PRD: Canvas UX — Clapet-inspired interactions, git tree panel

## Problem Statement

A user working on a Visual Canvas cannot easily create edges between nodes — the current mechanism requires holding Alt and click-dragging from a node to another node, which is undiscoverable and uses a crude straight-line preview. Once an edge exists, there is no way to reconnect it to a different node without deleting and recreating it. The connection experience lacks visual feedback: no affordances for where edges can be created, no physics-based preview of the connection line, no validation animations on valid drops. Beyond the canvas, the app has no way to browse git commit history as a proper graph with branch topology, or inspect commit diffs alongside metadata.

## Solution

Replace Alt+click-drag edge creation with four visible side handles per node that appear on hover, bob to signal availability, and become still when connected. Dragging from a handle draws a physics-simulated rope with marching-ants animation that validates the drop target with a green ring and pincer arrowhead, then commits the edge into the canvas. Existing edges can be rewired by grabbing the arrowhead, detaching the target end, and dropping on a new node. A new git tree panel renders the commit history as a proper DAG (directed acyclic graph) with colored branch lines, commit dots, and ref labels on a graph canvas column, alongside resizable author/message/date text columns. Selecting a commit shows its metadata in a detail pane and opens its diff in the diff viewer. Two-phase data loading fetches graph topology instantly, then lazily loads commit details for visible rows. The viewer dispatch pattern used by the file tree is extracted into a reusable abstraction so future panels can dispatch to any viewer type.

## User Stories

### Side handles

1. As a canvas user, I want to see affordances on a node when I hover over it, so that I know the node can be the source of an edge.
2. As a canvas user, I want the affordance to take the form of four half-pill handles (one per side), so that I can start an edge from any direction.
3. As a canvas user, I want empty handles to gently bob outward while I hover, so that I understand they are interactive and feel an impulse to click them.
4. As a canvas user, I want handles on connected sides to stay fully visible and still (no bob), so that I can see which sides already have edges at a glance.
5. As a canvas user, I want the handles' visual size to remain constant regardless of zoom level, so that I can always see and interact with them even when zoomed far out.
6. As a canvas user, I want the hit area for clicking a handle to be larger than the visible handle itself, so that I don't need pixel-perfect precision to start a connection.

### Drag-to-connect

7. As a canvas user, I want to press a side handle and drag toward a target node, so that I can create an edge between two nodes.
8. As a canvas user, I want a physics-simulated rope to follow my cursor while dragging, so that the connection feels physical and responsive rather than a rigid straight line.
9. As a canvas user, I want the rope to whip and settle naturally when I move the mouse quickly, so that the interaction feels alive and satisfying.
10. As a canvas user, I want the rope rendered as a dashed amber marching line, so that I can clearly distinguish the in-flight edge from committed edges.
11. As a canvas user, I want the target node to show a green drop ring when I'm hovering over a valid target, so that I know the drop will succeed before I release.
12. As a canvas user, I want the rope's arrowhead to animate into open pincers when over a valid target, so that the intent to connect is visually reinforced.
13. As a canvas user, I want a green confirmation pulse when I successfully drop on a valid target, so that I receive immediate feedback that the edge was created.
14. As a canvas user, I want the endpoints of the newly created edge to automatically resolve to the nearest connector points on each node, so that I don't have to position them precisely.
15. As a canvas user, I want the rope to snap away with a dismiss animation when I drop off-target, so that I understand the creation was cancelled.
16. As a canvas user, I do not want handles on other nodes to bob while I am dragging, so that they don't distract from the connection task.

### Rewire

17. As a canvas user, I want to see a grab affordance when hovering over an edge's arrowhead, so that I know I can rewire the edge.
18. As a canvas user, I want the arrowhead to morph from a chevron (rest) to a dot (hover) to a claw (grabbing), so that each interaction state has a clear visual representation.
19. As a canvas user, I want to grab the arrowhead and drag it to a different node, so that I can rewire an existing edge without deleting and recreating it.
20. As a canvas user, I want the detached end of the edge to become a physics rope following my cursor, so that rewiring feels the same as creating a new edge.
21. As a canvas user, I want the same green drop ring and pincer animation on valid targets during rewiring, so that the validation feedback is consistent with edge creation.
22. As a canvas user, I want the edge to snap back to its original target if I drop off-target, so that I don't accidentally disconnect an edge.

### Snapping and edge flow

23. As a canvas user, I want the rope's tip to snap to the nearest connector point on the target node as I approach it, so that the connection looks precise even before I drop.
24. As a canvas user, I want the closest handle on the target node to highlight in green, so that I can see which connector will be used.
25. As a canvas user, I want committed edges to show a solid base path at rest but animate a dashed amber flow path when any edge-dragging operation is in progress, so that the system feels cohesive and interconnected.

### Animations

26. As a canvas user, I want handle appearances and connection animations to respect my reduced-motion preference, so that the interface is accessible.
27. As a canvas user, I want a unified set of animation timing and easing tokens used consistently across all canvas interactions, so that the motion feels coherent rather than a patchwork of different speeds.

### Git tree panel — DAG graph

28. As a user, I want to see my repository's commit history as a proper git graph (DAG) with colored branch lines, merge forks, and commit dots, so that I can understand the branching structure and commit topology at a glance.
29. As a user, I want the graph canvas to be the leftmost column in the panel, with text columns (hash, author, message, date) to its right, so that I can scan commit metadata while tracing branch lines.
30. As a user, I want the graph to load near-instantly by first fetching only topology data (commit SHAs, parent relationships, branch/tag refs), and then lazily loading author/date/message details for visible rows as I scroll, so that even large repos feel responsive.
31. As a user, I want branch names, tags, and remote tracking branches shown as colored pill labels on the graph lines, with a clear HEAD indicator, so that I can orient myself within the repository's branch structure.
32. As a user, I want each branch line colored deterministically by branch identity using theme-compatible colors, so that I can visually track a branch through the graph without confusion.
33. As a user, I want to resize the columns by dragging separators between them, and have my preferred widths persist across sessions, so that I can optimize the layout for the data I care about most.
34. As a user, I want to navigate the commit list with arrow keys (up/down) and open a selected commit's diff by pressing Enter, so that I can browse history efficiently without leaving the keyboard.
35. As a user, I want to clear my selection with Escape, so that I can quickly reset focus.
36. As a user, I want to click a commit and see its diff in the Diff Viewer Panel, so that I can inspect what changed in that commit.
37. As a user, I want to see the selected commit's metadata (full hash, author, date, full message, files changed) in a detail pane within the git tree panel itself, so that I have all commit information visible at once without switching panels.
38. As a user, I want the detail pane to be toggleable and resizable relative to the graph list, so that I can show or hide it as needed.
39. As a user, I want to copy the full commit hash from the detail pane with a single click, so that I can share it or use it in commands.
40. As a user, I want a search bar at the top of the panel that filters commits by keyword, author, or date range in real-time, so that I can find specific commits without scrolling through the entire history.
41. As a user, I want the graph to handle large histories (10K+ commits) smoothly via virtual scrolling, so that performance doesn't degrade on mature repositories.
42. As a user, I want a refresh button to re-fetch the latest commit graph, so that it stays current as I make new commits.
43. As a user, I want the panel to show a loading indicator during initial fetch and an empty state when there are no commits, so that I'm never left wondering if it's broken.
44. As a user, I want the panel's visual design (fonts, spacing, colors, borders) to match the rest of the app's panels, so that it feels like a native part of the application rather than a bolt-on.

### Viewer dispatch extraction

45. As a panel developer, I want a reusable mechanism to dispatch content to the appropriate viewer panel, so that future panels (like git tree) don't need to reimplement the file-viewer coordination pattern.
46. As a user, I want the existing file tree → file viewer dispatch to continue working exactly as before after the extraction, so that the refactor is transparent to me.

## Implementation Decisions

### Architecture

- **Handle hit areas** use transparent SVG `<rect>` elements with `pointer-events: all` placed behind the visible handle paths — the same pattern used by tldraw. The visible handle gets `pointer-events: none` so hit detection is handled entirely by the enlarged hit rect.
- **Handle state toggling** uses CSS custom properties (`--handle-opacity`) on the node `<g>` element + a `.connected` className override. No CDC events — handle state is transient visual state, not a mutation of a persisted entity.
- **Handle state tracking** (`hoveredNodeId`) lives in panel-level React state in VisualCanvasPanel, derived alongside other transient-state fields like selectedNodeIds and editingNodeId.
- **Handles render as children** of each node's `<motion.g>` inside CanvasRenderer, using the same absolute canvas coordinates as the node body. No clip path — handles intentionally extend outside the node border.
- **Handle visual size is constant in screen pixels** regardless of zoom, achieved by wrapping each handle in a `<g transform="scale(1/zoom)">`.
- **`useCanvasEdgeCreation` (Alt+click-drag)** is removed as part of the handle system work. The `onMouseEnter`/`onMouseLeave` handlers on the node `<g>` are repurposed for `setHoveredNodeId`.
- **The Clapet teardown** is the source of truth for geometry constants, keyframe timings, and interaction state machines. Colors come from the app's existing theme, not the teardown's palette.
- **Mechanics are built before animations** — each interaction (handles, rope, drag, rewire, snapping) works with minimal or no animation first, then the keyframe catalog is applied.
- **Git tree panel uses two-phase loading** — Phase 1 fetches topology only (SHA, parent hashes, ref decorations) which is fast; Phase 2 lazily fetches author/date/message details via persistent `git cat-file --batch` for visible viewport rows. This matches Zed's architecture and keeps initial load near-instant.
- **Lane assignment runs in TypeScript** — the greedy column algorithm is ~2-5ms for 1,000 commits. Running it in Rust would add IPC serialization overhead without a speed benefit.
- **Git graph renders in SVG** — CSS variable theming works natively, React reconciliation handles row rendering, and `@tanstack/react-virtual` provides viewport virtualization. Canvas was rejected due to manual text layout, no CSS var support, and imperative API incompatibility with React.
- **Commit metadata and diff are separate** — clicking a commit dispatches the diff to the Diff Viewer Panel and shows metadata (hash, author, date, message, files changed) in the Git Tree Panel's detail pane.
- **All git tree panel styling uses app design tokens** (CSS variables for fonts, spacing, colors, borders) — no ad-hoc inline styles. Must match the visual language of File Tree, Terminal, Issue Tracker, and other panels.

### Modules

#### Deep modules (pure logic, no React, testable in isolation)

- **Rope Physics Engine**: Verlet integrator. Configuration: 18 mass points seeded along a sine-bow, gravity 0.42, damping 0.82, 8% slack + 22px, 6 constraint passes per frame. Interface: `stepRope(points: RopePoint[], target: Point, dt: number): RopePoint[]`. Returns updated point positions each animation frame.
- **Endpoint Geometry Resolver**: Given two node rectangles and an optional source side, computes the best connecting border midpoints. Implements the `dP()` (directional pick — choose the side of each rect facing the other) then `hP()` (handle point — compute that side's border midpoint) pipeline from the teardown. Interface: `resolveEdgeEndpoints(sourceRect: Rect, targetRect: Rect, sourceSide?: Side): { from: Point; to: Point }`.
- **Snapping Engine**: Computes distance from the rope tip to each of a target node's four side midpoints. Returns the closest one and its distance. Interface: `findNearestHandle(point: Point, nodeRect: Rect): { side: Side; distance: number; midpoint: Point }`.
- **Handle State Machine**: Pure derivation from hover state + node data + edge data. Determines whether each handle is hidden, bobbing, or still. Interface: `getHandleStates(hoveredNodeId: string | null, nodes: NodeData[], edges: EdgeData[]): Map<string, SideState[]>`. `SideState` = `{ visible: boolean; bobbing: boolean }`.
- **Lane Assignment Algorithm**: Port of the greedy column (lane) assignment algorithm from CommitGraph / tig. Input: `{ sha: string; parent_hashes: string[] }[]` (commits in topological order). Output: `{ sha: string; column: number; row: number }[]`. Handles octopus merges, cross-branch merges, branch collapse (branch ends), and branch-out (new branch forks). Interface: `computeLanes(commits: CommitTopology[]): CommitPosition[]`. Runs in O(n × b) where n is commits and b is active branches.
- **Branch Color Palette**: Given a branch identity (SHA of the branch's first commit), returns one of 8-10 theme-compatible CSS variable color tokens. Deterministic — the same branch always gets the same color across refreshes. Interface: `getBranchColor(branchFirstSha: string): string`.

#### UI modules (React components/hooks)

- **SideHandle Component**: SVG half-pill `<path>` + invisible hit `<rect>`, rendered per side inside the node's `<g>`. Accepts `side`, `nodeRect`, `isConnected`, zoom level. The four side-specific bob keyframes (`handle-bob-top/right/bottom/left`) are ported from the teardown and applied via className.
- **NodeHandles Component**: Renders four SideHandles inside each node `<g>`. Wraps them in an inverse-scaled `<g>` for constant screen size. Sets CSS custom properties on the parent node group.
- **RopeRenderer Component**: Renders the in-flight rope polyline with dashed amber stroke and marching-ants animation. Drives the rope physics engine via `requestAnimationFrame`.
- **Edge Flow Renderer**: Two-path edge rendering stack — a solid base path visible at rest, and a dashed amber flow path that fades in during global edge-drag operations. Used by both in-flight connections and committed edges.
- **DropRing Component**: Green ring animation that appears around a valid target node during drag-over. Implemented as an animated SVG `<rect>` or overlay.
- **RewireArrowhead Component**: Arrowhead with three morph states — chevron, dot, claw. Handles the grab affordance, hover detection, and state transitions.
- **Animation Primitives**: Centralized CSS `@keyframes` catalog and design tokens. The existing inline `<style>` block in VisualCanvasPanel is refactored into a shared location. All animations are gated on `[data-motion="full"]` using the existing motion-preference system. Minimum subset includes: handle bob (4), edge drag flow, brush-connected, shockwave, pincer upper/lower, and two timing functions (state change `0.15s cubic-bezier(.2,.8,.2,1)` and physical response `0.62s cubic-bezier(.19,1.42,.36,1)`).
- **Viewer Dispatch Abstraction**: Generalizes `ViewerRegistry` to support dispatch targets beyond file-views. A viewer registers with a `contentType` (e.g., `"file"`, `"diff"`), and dispatchers ask for the last-focused viewer of a given type. The existing `PanelActionBridge` pattern for diff-viewer dispatch is absorbed into this abstraction.
- **Git Graph Canvas**: SVG component that renders the git DAG for visible rows only. Draws branch lines as colored `<path>` elements connecting parent/child commit dots, commit dots as `<circle>` elements, and ref labels as pill-shaped `<rect>`+`<text>`. Rendered as the leftmost column in each virtualized row.
- **Resizable Column**: A column wrapper with a drag-handle separator on the right edge. Tracks width in component state, persists to localStorage on drag-end. Columns can have minimum widths but no maximum.
- **Commit Row**: One row in the virtualized list. Renders the graph canvas cell + hash cell + author cell + message cell + date cell. Each cell uses the app's design tokens for fonts and spacing.
- **Search Bar**: Input bar at the top of the git tree panel. Filters commits in real-time by keyword (searches message), author (searches author name), and date range. Results highlight matching text in the message column. Reuses the existing `search_history` backend command for server-side filtering.
- **Commit Detail Pane**: Bottom section of the git tree panel (toggleable/resizable split from the graph list). Shows full hash (with copy button), author name and email, absolute and relative date, full commit message, and a files changed list (from `git diff-tree --stat`). Collapses when no commit is selected.
- **Git Tree Panel**: Rewritten panel component composing Graph Canvas, Resizable Columns, Search Bar, and Commit Detail Pane. Uses `@tanstack/react-virtual` for viewport virtualization. Orchestrates two-phase data loading: fetches topology on mount, then lazily fetches details as rows enter the viewport. Handles keyboard navigation (arrow keys, Enter, Escape). All styling uses app CSS variables.

#### Integrated orchestrator hooks

- **useCanvasEdgeCreation (replaced)**: New implementation that coordinates handle press → rope physics loop → target validation via `hoveredNodeId` → edge commit via existing `create_canvas_edge` MCP operation. Replaces the Alt+click-drag hook.
- **useCanvasRewire (new)**: Coordinates arrowhead grab → detachment → rope physics loop → reattachment via `update_canvas_edge` or restore on cancel.

### Color tokens

- All new canvas UI uses the app's existing CSS custom properties (e.g., `--canvas-edge`, `--text-muted`). No colors from the Clapet teardown palette are imported. If the app lacks a color token for a new concept (e.g., amber for in-flight edges), a token is added to the existing token set rather than hardcoded.
- Git tree panel uses the app's panel design tokens for fonts, spacing, borders, and background colors. Branch line colors cycle through 8-10 theme-compatible hues keyed deterministically by the branch's first commit SHA.

### Backend changes

- **`CommitInfo` struct extended** with `parent_hashes: Vec<String>` and `refs: Vec<String>` (branch, tag, remote ref names pointing to the commit). Both serializable via serde.
- **New Tauri command: `get_graph_topology`** — takes `session_id` and optional `max_count` (default 500). Runs `git log --all --topo-order --format="%H|%P|%D" --max-count=<n>`. Parses output into `Vec<CommitInfo>` with `parent_hashes` and `refs` populated; author/date/message fields are empty (filled later by lazy detail fetch). SHA line format: pipe-separated with space within parent list and ref decorators.
- **New Tauri command: `get_commit_details`** — takes `session_id` and `shas: Vec<String>`. Runs `git cat-file --batch` via stdin with each SHA. Parses output into `Vec<CommitInfo>` with author, date, and message populated. Called lazily only for commits in the current viewport.
- **New Tauri command: `get_commit_diff`** — already implemented from issue 007. Fetches diff for a specific commit hash or a range between two commits via `git show` or `git diff`. Used when the user clicks a commit to view its diff.
- **New Tauri command: `get_diff_tree`** — takes `session_id` and `hash`. Runs `git diff-tree --stat <hash>` to get the files-changed list for the Commit Detail Pane.
- No new SQLite tables. Canvas edge mutations use existing CDC events. Handle state is purely ephemeral frontend state. Git history data is transient (fetched from git, not persisted).

## Testing Decisions

### What makes a good test

Tests verify external behavior (inputs → outputs) of pure-logic modules, not implementation details like which CSS class is applied or how many `useEffect` calls fire. A good test asserts that given these inputs, the function produces these outputs, including edge cases. Components and hooks that render SVG, manage mouse events, or animate are not tested — their correctness is validated through manual visual QA. Shell-command-based Rust commands are tested manually.

### Modules tested

- **Rope Physics Engine**: Step-by-step Verlet integration correctness. Settling behavior over multiple frames, damping decay, constraint convergence. Edge cases: zero-length rope, infinite target distance, overlapping points.
- **Endpoint Geometry Resolver**: Correct endpoints for all 16 combinations of source/target sides, overlapping rects, zero-width/zero-height rects, extreme size differences.
- **Snapping Engine**: Nearest-handle selection for points at every side, corners, center, and far away. All four sides as closest.
- **Handle State Machine**: Correct states for: no hover, hover with unconnected node, hover with fully-connected node, hover with partially-connected node, multiple edges sharing sides.
- **Lane Assignment Algorithm**: 6+ tests covering: linear history (every commit has one parent, single lane), single branch fork (two branches diverging), octopus merge (3+ parents merging into one child), cross-branch merge (merging from a branch that is to the right), branch collapse (branch ends, lane reclaimed), fast-forward chain (sequence of single-parent commits on one branch).

### Prior art

- `src/types/errors.test.ts` — pure-function tests with simple input/output assertions
- `src/file-panel/cache.test.ts` — module-level state fixture with `beforeEach` reset
- `src/screenLayout.geometry.test.ts` — geometry function tests with table-style cases
- `src/canvas/ropePhysics.test.ts` — Verlet integration tests with multi-frame settling
- `src/canvas/snapping.test.ts` — geometry tests for nearest-handle selection

Tests are written in Vitest, colocated with source files (e.g., `src/panels/git/laneAssignment.test.ts` alongside `laneAssignment.ts`). Test framework is already configured in `vite.config.ts` with `jsdom` environment and `@testing-library/jest-dom/vitest` matchers.

## Out of Scope

- **C4 annotation/notes model**: The interaction between AI-generated feedback notes, user scratchpad notes, and the C4 diagram generation MCP tool is not specified and not implemented.
- **Full animation catalog port**: The Clapet teardown documents 39 keyframes. Only the subset needed for the interactions in this PRD is ported. Full catalog migration is deferred.
- **Color token unification across the entire app**: This PRD requires new canvas tokens to follow the existing scheme. A comprehensive audit and refactor of all color tokens across all panels is deferred.
- **AI-driven handle or edge mutations**: Handles remain human-interaction-only. The AI does not trigger handle visibility or edge creation through CDC events in this phase.
- **Git tree panel branching/checkout operations**: The panel is read-only — it browses and inspects commits. It does not checkout branches, create tags, or stage changes.
- **Undo support for rewire**: Rewire operations produce undoable canvas commands, but undoing a rewire restores the edge to its original endpoint state — complex redo state for multi-step rewires is not supported.
- **Git graph collab/remote support**: The graph shows commits from the local repository only. Remote-tracking branch refs are shown as labels, but the graph does not fetch from remotes or visualize divergent remote histories.
- **Context menu actions on commits**: Right-clicking a commit does not show a context menu (cherry-pick, revert, reset, checkout). Clicking a commit opens its diff — that is the only action.
- **Graph filtering by branch**: The graph always shows `--all` branches. Filtering to a single branch's history is not supported.

## Further Notes

- The Clapet teardown file (`clapet-design-teardown.html` in the repo root) is the reference implementation for all interaction patterns, physics constants, geometry math, and keyframe definitions. When a decision conflicts between the teardown and a different source, the teardown wins.
- The map and child tickets live at `.scratch/canvas-ux/`. Implementation follows the ticket dependency order.
- Domain vocabulary is in `.aw/CONTEXT.md`. Implementation agents should consult it for canonical definitions of Side Handle, Handle State, Handle Hit Area, Canvas Interaction Hover Tracking, Git Graph Canvas, Lane, Branch Line, Ref Label, Commit Row, Commit Detail Pane, Two-Phase Loading, and Greedy Column Assignment.
- The lane assignment algorithm reference is CommitGraph's `computePosition.ts` (~120 lines of clean TypeScript) with edge case handling verified against tig's `graph-v2.c`.
- Git tree panel architecture is documented in ADR 0016 at `.aw/adr/0016-git-graph-panel.md`.
