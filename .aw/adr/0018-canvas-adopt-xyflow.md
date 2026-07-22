# Canvas overhaul: adopt @xyflow/react as the canvas engine

**Status:** Accepted

The Visual Canvas Panel is being overhauled (frontend only — no schema, command, CDC, or MCP tool changes). Rather than building a custom hybrid HTML+SVG renderer from scratch, we are adopting `@xyflow/react` (already in `package.json` at `^12.11.2`, MIT licensed) as the canvas engine.

xyflow provides: HTML-div nodes, SVG edges, smooth-step orthogonal routing, pan/zoom, node/edge drag, marquee selection, snap-to-grid, group nesting (`parentId` + `expandParent`), and ResizeObserver-based measurements — all things the overhaul was planning to build. The integration surface is a two-way sync layer:

- **Backend → xyflow**: on mount and on CDC events, fetch from SQLite → map to xyflow nodes/edges → `setNodes`/`setEdges`
- **xyflow → backend**: xyflow callbacks (`onNodesChange`, `onEdgesChange`, `onConnect`) → map to our command layer → backend emits CDC events → xyflow re-syncs

Custom chrome (inline edit, tag pills, delete button, handle-bob, edge-brush glow, verlet drag rope) is built as custom `Node`, `Edge`, and `Handle` components on xyflow's extension points. The CursorFollower HUD is removed; a static hints bar replaces it. Per-canvas viewport persistence maps to/from xyflow's viewport state.
