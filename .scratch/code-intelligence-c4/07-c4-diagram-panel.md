Status: ready-for-agent

# 07: C4 Diagram Panel

## What to build

The C4 Diagram Panel — a new panel type that renders C4 architecture diagrams with drill-down navigation through four levels. Uses the shared CanvasRenderer (slice 06) in read-only mode and the C4 diagram data from the generator (slice 05).

The panel has:
- A zero state with a copy-paste prompt for the AI to generate a diagram
- A diagram list view for managing saved diagrams (list, open, delete, rename)
- A drill-down view that renders the C4 hierarchy: Context → Container → Component → Code
- Breadcrumb navigation showing the current path
- Inline code snippets at the Code level (L4)
- Pan/zoom and the rope effect inherited from the shared CanvasRenderer

Registered as panel type `"c4-diagram"` (label "C4 Diagram") in `panelRegistry.tsx`.

## Acceptance criteria

- [ ] `C4DiagramPanel` React component registered as panel type `"c4-diagram"` (label "C4 Diagram")
- [ ] `src/App.tsx` side-effect imports `C4DiagramPanel`
- [ ] Zero state: when no diagram is selected, shows a copy-paste prompt (e.g., "Use the aiaw `generate_c4_diagram` tool to create a C4 diagram of the codebase")
- [ ] Diagram list: fetches diagrams via `list_c4_diagrams` Tauri command; shows name, created date; allows opening, deleting, renaming
- [ ] Listens to `"c4-diagrams-changed"` event for live refresh when AI creates/updates diagrams
- [ ] Drill-down view: renders nodes and edges using `CanvasRenderer` in read-only mode
- [ ] Level filtering: at each level, only show nodes/edges for that level and the next level down
- [ ] Click-to-drill: clicking a node at Context/Container/Component level drills into its children
- [ ] Breadcrumb navigation: shows current path (e.g., `System > Auth Service > Token Validator`); clicking a breadcrumb navigates back up
- [ ] Code level (L4): displays inline code snippets for code-level nodes
- [ ] Back button: navigates up one level
- [ ] Pan and zoom works (inherited from CanvasRenderer)
- [ ] Visual Canvas rope effect and interactive feel preserved (in read-only mode — no editing, but smooth pan/zoom/click)

## Blocked by

- [01-c4-diagram-schema-and-repository.md](01-c4-diagram-schema-and-repository.md) — needs the `c4_diagrams` table and Tauri commands
- [05-c4-diagram-generator-mcp-tool.md](05-c4-diagram-generator-mcp-tool.md) — needs generated diagram data to display
- [06-shared-canvas-renderer.md](06-shared-canvas-renderer.md) — needs the shared CanvasRenderer component
