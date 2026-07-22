# Drag-to-connect with rope physics

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## What to build

Full drag-to-connect interaction from handle press to committed edge. Includes the Verlet-integration rope physics engine that draws the in-flight connection line.

Rope physics: 18 mass points seeded along a sine-bow between source handle and cursor, updated every animation frame. Gravity 0.42, damping 0.82, 8% slack + 22px, 6 constraint passes per frame. Rendered as a dashed amber marching-ants polyline. When the mouse moves fast, the rope visibly whips and settles.

Interaction flow: press a handle → begin drag → rope follows cursor with physics → hovering a valid target shows green drop ring + arrowhead pincer animation → hovering off-target shows no validation → drop on valid target fires green confirm pulse, resolves both endpoints by geometry (pick side facing the other card, compute border midpoint), commits edge → drop off-target snaps rope away, no edge created. During drag, suppress handle bob on all nodes.

## Acceptance criteria

- [ ] Pressing a side handle starts a connection drag and seeds a physics rope from handle to cursor
- [ ] The rope moves with the cursor — not rigidly, but with visible whip and settling
- [ ] Moving the mouse quickly produces visible overshoot and damping
- [ ] The rope is rendered as a dashed amber polyline with marching-ants animation
- [ ] Hovering the rope over a valid target node shows a green drop ring on that node
- [ ] Hovering over a valid target animates the rope's arrowhead into pincer jaws (two arcs rotating ±10°)
- [ ] Hovering off-target or over the source node shows no green ring and no pincer
- [ ] Dropping on a valid target fires a green confirmation pulse, resolves endpoints to nearest sides, and creates a permanent edge
- [ ] Dropping off-target snaps the rope away with a dismiss animation and creates nothing
- [ ] All node handles stop bobbing while any drag-to-connect is in progress
- [ ] The rope physics engine (`stepRope`) is a pure function with automated tests covering: settling, damping decay, constraint convergence, fast mouse movement

## Blocked by

- `001-node-side-handles.md`
