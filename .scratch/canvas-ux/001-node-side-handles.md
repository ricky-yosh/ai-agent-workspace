# Node side handles on canvas nodes

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## What to build

Replace the Alt+click-drag edge-creation model with four half-pill side handles (top, right, bottom, left) on every node. Handles render inside each node's `<motion.g>` as SVG elements. Hit areas use transparent `<rect>` behind visible `<path>` (tldraw pattern). State toggling uses CSS custom properties on the node `<g>` + `.connected` className override. `hoveredNodeId` tracked in panel-level state. Handles stay constant screen size via inverse zoom scaling. `useCanvasEdgeCreation` hook repurposed for handle-based drag from side handles; old hover handlers repurposed for handle visibility toggling.

## Acceptance criteria

- [ ] Hovering a node reveals four half-pill handles (one per side), fading in via CSS transition
- [ ] Handles that have no edge gently bob outward with side-specific direction (top bobs up, right bobs right, etc.)
- [ ] Handles on connected sides stay fully opaque and still (no bob)
- [ ] Handle hit area is larger than visible shape — clickable within 10px outward, 2px toward node
- [ ] Handles remain the same visual size on screen regardless of zoom (25% or 200%)
- [ ] Handles do not clip at node boundaries — they extend outward from the node border
- [ ] Alt+click-drag no longer does anything; edge creation is initiated by dragging from a side handle instead
- [ ] Handles respect the motion preference system (`data-motion="reduced"` disables bob)

## Blocked by

None — can start immediately.
