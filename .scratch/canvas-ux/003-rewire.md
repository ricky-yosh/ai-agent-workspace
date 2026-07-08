# Rewire — detach and reattach edges

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## What to build

Implement the rewire interaction for existing edges. The user hovers an edge's arrowhead, sees a grab affordance, and can detach the target end to drag it to a new node.

Arrowhead morphs through three states: chevron (rest) → dot (hover, filled circle with border) → claw (grabbing, two open stroke arcs). Grabbing the arrowhead detaches the edge's target end, which becomes a rope following the cursor (reusing the rope physics engine and validation UI from drag-to-connect). Drop on a valid node reattaches the edge with updated `target_node_id`. Drop off-target snaps the edge back to its original target.

## Acceptance criteria

- [ ] Hovering a committed edge's arrowhead shows `cursor: grab` and the arrowhead morphs to a dot
- [ ] Pressing the arrowhead morphs it to a claw and detaches the target end of the edge
- [ ] The detached end becomes a physics rope with marching-ants, identical to drag-to-connect
- [ ] Valid target hover during rewire shows the same green drop ring + pincer animation as drag-to-connect
- [ ] Dropping on a valid node updates the edge's `target_node_id` and resolves new endpoint geometry
- [ ] Dropping off-target snaps the rope back to the original target — the edge is unchanged
- [ ] Edge endpoint geometry resolver (`resolveEdgeEndpoints`) has automated tests covering all 16 source/target side combinations

## Blocked by

- `001-node-side-handles.md`
- `002-drag-to-connect.md`
