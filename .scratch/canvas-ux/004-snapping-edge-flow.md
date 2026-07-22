# Snapping and edge flow animations

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## What to build

Add snapping and edge flow polish on top of drag-to-connect.

Snapping: when dragging a new edge toward a target node, snap the rope tip to the nearest connector point. Highlight the closest side handle in green. The snapping engine (`findNearestHandle`) computes distance from the rope tip to four side midpoints and selects the closest.

Edge flow: committed edges render with a two-path stack. A solid base path is always visible. A dashed amber flow path (marching-ants) fades in when any edge-dragging operation is in progress and is hidden at rest. Uses the same `edge-drag-flow` animation as the in-flight rope.

## Acceptance criteria

- [ ] Approaching a target node while dragging snaps the rope tip to the nearest side midpoint
- [ ] The winning handle on the target node highlights in green with a scale-up effect
- [ ] Committed edges show only a solid base path at rest
- [ ] Committed edges show a dashed amber flow path fading in when any drag-to-connect or rewire operation is active
- [ ] Snapping engine (`findNearestHandle`) has automated tests covering: all four sides, corners, far-away points, zero-size rect

## Blocked by

- `002-drag-to-connect.md`
