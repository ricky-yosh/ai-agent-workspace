# Canvas UX — Clapet-inspired interactions, git tree panel

Labels: `wayfinder:map`

## Notes

**Domain**: Visual Canvas panel, C4 Diagram panel, Diff Viewer panel, Git Tree Panel.

**Standing preferences**:
- Colors must follow the app's existing theme (single source of truth), not the clapet teardown palette.
- Extract reusable viewer-dispatch patterns (like file-tree → file-viewer) into shared components.
- Mechanics first, then animations.
- All panels must use app design tokens (CSS variables for fonts, spacing, colors).

**Reference**: `clapet-design-teardown.html` in repo root — source of the interaction patterns.

## Decisions so far

- 001 Node side handles: half-pill geometry, 20px×10px, 10px outward + 2px inward hit area, constant screen size via `scale(1/zoom)`, state machine (hidden → bobbing → still)
- 002 Drag-to-connect: Verlet rope physics (18 points, gravity 0.42, damping 0.82, 8% slack + 22px, 6 passes), amber marching rope, pincer arrowhead
- 003 Rewire: arrowhead grab affordance, detach/reattach, backend `update_canvas_edge` extended with source/target node IDs
- 004 Snapping + edge flow: `findNearestHandle` snapping, green highlight, two-path edge rendering
- 005 Animation primitives: CSS extracted to `canvas-animations.css`, motion-preference gating
- 006 Viewer dispatch: ViewerRegistry generalized with `contentType`, PanelActionBridge absorbed
- 007 Git tree panel: Partially built (flat list, search, commit diff dispatch). Needs full DAG rewrite per ADR 0016.

## Current focus

**007 Git tree panel — rewrite as proper git DAG** (see ADR 0016):
- Two-phase loading: topology via `git log %H|%P|%D`, details lazy via `git cat-file --batch`
- TypeScript greedy column lane assignment (port from CommitGraph)
- SVG rendering with 5 resizable columns: Graph Canvas | Hash | Author | Message | Date
- Split pane: virtualized list on top, Commit Detail Pane on bottom
- Keyboard nav (arrow keys, Enter, Escape), search bar
- Branch/tag/remote ref labels as colored pills
- All app design tokens (no ad-hoc styles)

## Fog

- **C4 annotation/notes model**: Two potential note types (AI-feedback notes vs. user/AI scratchpad notes). Needs investigation into the MCP tool contract (e.g. `get_c4_feedback`) and how notes feed back into `generate_c4_diagram`. Too fuzzy to ticket yet.
- **Animation catalog porting**: The teardown documents 39 CSS keyframes. Which subset to port, in what order, and how they integrate with the CDC event-driven animation system. Will become specifiable once the core mechanics are built.
- **Color token unification**: The app may have color tokens defined in multiple places (CSS variables, Tailwind config, inline styles). A single-source-of-truth refactor may touch files beyond the panels being worked on. Scope unclear until investigated.
