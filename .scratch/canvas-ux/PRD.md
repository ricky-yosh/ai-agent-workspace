# PRD: Canvas UX — Clapet-inspired interactions, git tree panel

## Problem Statement

A user working on a Visual Canvas cannot easily create edges between nodes — the current mechanism requires holding Alt and click-dragging from a node to another node, which is undiscoverable and uses a crude straight-line preview. Once an edge exists, there is no way to reconnect it to a different node without deleting and recreating it. The connection experience lacks visual feedback: no affordances for where edges can be created, no physics-based preview of the connection line, no validation animations on valid drops. Beyond the canvas, the app has no way to browse git commit history and open commits in the diff viewer.

## Solution

Replace Alt+click-drag edge creation with four visible side handles per node that appear on hover, bob to signal availability, and become still when connected. Dragging from a handle draws a physics-simulated rope with marching-ants animation that validates the drop target with a green ring and pincer arrowhead, then commits the edge into the canvas. Existing edges can be rewired by grabbing the arrowhead, detaching the target end, and dropping on a new node. A new standalone git tree panel shows commit history grouped by author, date, or branch, and dispatches selected commits or commit ranges to the diff viewer. The viewer dispatch pattern used by the file tree is extracted into a reusable abstraction so future panels can dispatch to any viewer type.

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

### Git tree panel

28. As a user, I want to see my repository's commit history in a hierarchical tree view (grouped by author, date, or branch), so that I can understand recent activity at a glance.
29. As a user, I want each entry to show the commit message, author, relative date, and abbreviated hash, so that I have enough information to decide if a commit is interesting.
30. As a user, I want to click a single commit and have its diff open in the diff viewer, so that I can inspect what changed.
31. As a user, I want to select a range of commits and see their cumulative diff in the diff viewer, so that I can understand changes over a period or across a batch of work.
32. As a user, I want a refresh button to re-fetch the latest commit history, so that the tree stays current as I make new commits.

### Viewer dispatch extraction

33. As a panel developer, I want a reusable mechanism to dispatch content to the appropriate viewer panel, so that future panels (like git tree) don't need to reimplement the file-viewer coordination pattern.
34. As a user, I want the existing file tree → file viewer dispatch to continue working exactly as before after the extraction, so that the refactor is transparent to me.

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

### Modules

#### Deep modules (pure logic, no React, testable in isolation)

- **Rope Physics Engine**: Verlet integrator. Configuration: 18 mass points seeded along a sine-bow, gravity 0.42, damping 0.82, 8% slack + 22px, 6 constraint passes per frame. Interface: `stepRope(points: RopePoint[], target: Point, dt: number): RopePoint[]`. Returns updated point positions each animation frame.
- **Endpoint Geometry Resolver**: Given two node rectangles and an optional source side, computes the best connecting border midpoints. Implements the `dP()` (directional pick — choose the side of each rect facing the other) then `hP()` (handle point — compute that side's border midpoint) pipeline from the teardown. Interface: `resolveEdgeEndpoints(sourceRect: Rect, targetRect: Rect, sourceSide?: Side): { from: Point; to: Point }`.
- **Snapping Engine**: Computes distance from the rope tip to each of a target node's four side midpoints. Returns the closest one and its distance. Interface: `findNearestHandle(point: Point, nodeRect: Rect): { side: Side; distance: number; midpoint: Point }`.
- **Handle State Machine**: Pure derivation from hover state + node data + edge data. Determines whether each handle is hidden, bobbing, or still. Interface: `getHandleStates(hoveredNodeId: string | null, nodes: NodeData[], edges: EdgeData[]): Map<string, SideState[]>`. `SideState` = `{ visible: boolean; bobbing: boolean }`.

#### UI modules (React components/hooks)

- **SideHandle Component**: SVG half-pill `<path>` + invisible hit `<rect>`, rendered per side inside the node's `<g>`. Accepts `side`, `nodeRect`, `isConnected`, zoom level. The four side-specific bob keyframes (`handle-bob-top/right/bottom/left`) are ported from the teardown and applied via className.
- **NodeHandles Component**: Renders four SideHandles inside each node `<g>`. Wraps them in an inverse-scaled `<g>` for constant screen size. Sets CSS custom properties on the parent node group.
- **RopeRenderer Component**: Renders the in-flight rope polyline with dashed amber stroke and marching-ants animation. Drives the rope physics engine via `requestAnimationFrame`.
- **Edge Flow Renderer**: Two-path edge rendering stack — a solid base path visible at rest, and a dashed amber flow path that fades in during global edge-drag operations. Used by both in-flight connections and committed edges.
- **DropRing Component**: Green ring animation that appears around a valid target node during drag-over. Implemented as an animated SVG `<rect>` or overlay.
- **RewireArrowhead Component**: Arrowhead with three morph states — chevron, dot, claw. Handles the grab affordance, hover detection, and state transitions.
- **Animation Primitives**: Centralized CSS `@keyframes` catalog and design tokens. The existing inline `<style>` block in VisualCanvasPanel is refactored into a shared location. All animations are gated on `[data-motion="full"]` using the existing motion-preference system. Minimum subset includes: handle bob (4), edge drag flow, brush-connected, shockwave, pincer upper/lower, and two timing functions (state change `0.15s cubic-bezier(.2,.8,.2,1)` and physical response `0.62s cubic-bezier(.19,1.42,.36,1)`).
- **Viewer Dispatch Abstraction**: Generalizes `ViewerRegistry` to support dispatch targets beyond file-views. A viewer registers with a `contentType` (e.g., `"file"`, `"diff"`), and dispatchers ask for the last-focused viewer of a given type. The existing `PanelActionBridge` pattern for diff-viewer dispatch is absorbed into this abstraction.
- **Git Tree Panel**: New panel type registered alongside file-viewer, diff-viewer, visual-canvas, etc. Fetches commit history via the existing `search_history` operation, groups results, and renders a collapsible tree. Dispatches commit/range selections to a diff-viewer via the viewer dispatch abstraction. Requires a new backend command to fetch the diff for a specific commit or commit range.

#### Integrated orchestrator hooks

- **useCanvasEdgeCreation (replaced)**: New implementation that coordinates handle press → rope physics loop → target validation via `hoveredNodeId` → edge commit via existing `create_canvas_edge` MCP operation. Replaces the Alt+click-drag hook.
- **useCanvasRewire (new)**: Coordinates arrowhead grab → detachment → rope physics loop → reattachment via `update_canvas_edge` or restore on cancel.

### Color tokens

- All new canvas UI uses the app's existing CSS custom properties (e.g., `--canvas-edge`, `--text-muted`). No colors from the Clapet teardown palette are imported. If the app lacks a color token for a new concept (e.g., amber for in-flight edges), a token is added to the existing token set rather than hardcoded.

### Backend changes

- New Tauri command: `get_commit_diff` — fetches the diff for a specific commit hash or a range between two commits. Updates the existing `search_history` and `get_git_diff` commands if needed for range support.
- No changes to the canvas edge data model — `create_canvas_edge` and `update_canvas_edge` (for rewire) already exist.
- No new SQLite tables. Canvas edge mutations use existing CDC events. Handle state is purely ephemeral frontend state.

## Testing Decisions

### What makes a good test

Tests verify external behavior (inputs → outputs) of pure-logic modules, not implementation details like which CSS class is applied or how many `useEffect` calls fire. A good test asserts that given these inputs, the function produces these outputs, including edge cases. Components and hooks that render SVG, manage mouse events, or animate are not tested — their correctness is validated through manual visual QA.

### Modules tested

- **Rope Physics Engine**: Step-by-step Verlet integration correctness. Settling behavior over multiple frames, damping decay, constraint convergence. Edge cases: zero-length rope, infinite target distance, overlapping points.
- **Endpoint Geometry Resolver**: Correct endpoints for all 16 combinations of source/target sides, overlapping rects, zero-width/zero-height rects, extreme size differences.
- **Snapping Engine**: Nearest-handle selection for points at every side, corners, center, and far away. All four sides as closest.
- **Handle State Machine**: Correct states for: no hover, hover with unconnected node, hover with fully-connected node, hover with partially-connected node, multiple edges sharing sides.

### Prior art

- `src/types/errors.test.ts` — pure-function tests with simple input/output assertions
- `src/file-panel/cache.test.ts` — module-level state fixture with `beforeEach` reset
- `src/screenLayout.geometry.test.ts` — geometry function tests with table-style cases

Tests are written in Vitest, colocated with source files (e.g., `src/canvas/ropePhysics.test.ts` alongside `ropePhysics.ts`). Test framework is already configured in `vite.config.ts` with `jsdom` environment and `@testing-library/jest-dom/vitest` matchers.

## Out of Scope

- **C4 annotation/notes model**: The interaction between AI-generated feedback notes, user scratchpad notes, and the C4 diagram generation MCP tool is not specified and not implemented.
- **Full animation catalog port**: The Clapet teardown documents 39 keyframes. Only the subset needed for the interactions in this PRD is ported. Full catalog migration is deferred.
- **Color token unification across the entire app**: This PRD requires new canvas tokens to follow the existing scheme. A comprehensive audit and refactor of all color tokens across all panels is deferred.
- **AI-driven handle or edge mutations**: Handles remain human-interaction-only. The AI does not trigger handle visibility or edge creation through CDC events in this phase.
- **Git tree panel branching/checkout operations**: The panel is read-only — it browses and inspects commits. It does not checkout branches, create tags, or stage changes.
- **Undo support for rewire**: Rewire operations produce undoable canvas commands, but undoing a rewire restores the edge to its original endpoint state — complex redo state for multi-step rewires is not supported.

## Further Notes

- The Clapet teardown file (`clapet-design-teardown.html` in the repo root) is the reference implementation for all interaction patterns, physics constants, geometry math, and keyframe definitions. When a decision conflicts between the teardown and a different source, the teardown wins.
- The map and child tickets live at `.scratch/canvas-ux/`. Implementation follows the ticket dependency order: unblocked tickets (001, 002, 007) first, then sequentially through the dependency chain.
- Domain vocabulary is in `.aw/CONTEXT.md`. Implementation agents should consult it for canonical definitions of Side Handle, Handle State, Handle Hit Area, and Canvas Interaction Hover Tracking.
