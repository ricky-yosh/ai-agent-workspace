Status: ready-for-agent

# 06: Shared Canvas Renderer

## What to build

Extract the core 2D canvas rendering from the Visual Canvas Panel into a reusable `CanvasRenderer` component. This component handles: 2D canvas setup, pan/zoom, node/edge/group rendering, the rope effect, hit detection, and drag interactions.

Both the Visual Canvas Panel and the C4 Diagram Panel will consume this component. The Visual Canvas adds editing interactions (place nodes, draw edges). The C4 Diagram Panel adds read-only drill-down behavior.

This slice does NOT change the Visual Canvas Panel's behavior — it extracts the renderer and wires the existing panel back up to use it. The C4 Diagram Panel uses it in slice 07.

## Acceptance criteria

- [ ] `CanvasRenderer` React component exists, extracted from the current Visual Canvas rendering code
- [ ] Component accepts props for: nodes, edges, groups, interaction mode (editable vs read-only), event handlers
- [ ] Pan and zoom behavior preserved (infinite canvas with scroll/pinch zoom)
- [ ] Node rendering preserved (position, content, styling)
- [ ] Edge rendering preserved (connections between nodes)
- [ ] Group rendering preserved (visual containment of nodes)
- [ ] Rope effect preserved (the interactive connection-drawing UX)
- [ ] Hit detection preserved (clicking nodes/edges/groups registers correctly)
- [ ] Drag interactions preserved (moving nodes, etc.)
- [ ] Visual Canvas Panel continues to work identically after refactor (no regression)
- [ ] `read-only` interaction mode disables editing interactions (no drag, no rope, no context menus)
- [ ] `read-only` mode still allows: pan, zoom, click events (for drill-down in C4 panel)

## Blocked by

None — can start immediately.
