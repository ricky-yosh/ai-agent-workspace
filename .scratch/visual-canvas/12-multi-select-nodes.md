Status: ready-for-agent

# 12: Multi-select nodes

## What to build

Enable selecting multiple nodes for batch operations. Click to select single node, Shift+click to add to selection, drag to box-select. Selected nodes can be moved or deleted together.

## Acceptance criteria

- [ ] Click on node selects it (deselects others)
- [ ] Shift+click adds/removes node from selection
- [ ] Drag on empty canvas starts box-select (rubber band)
- [ ] Box-select selects all nodes within rectangle
- [ ] Selected nodes show selection indicator (e.g., highlight border)
- [ ] Dragging selected node moves all selected nodes together
- [ ] Delete key deletes all selected nodes
- [ ] Escape deselects all
- [ ] Selection state cleared on canvas pan/zoom
- [ ] Test: select multiple nodes, drag, verify all positions updated

## Blocked by

- 02-create-and-view-nodes
- 03-move-nodes-on-canvas
