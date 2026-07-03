Status: ready-for-human

# 03: Move nodes on canvas

## What to build

Enable dragging nodes to reposition them on the canvas. Users click and drag nodes to new positions; changes persist to the database. This establishes the drag interaction pattern used by subsequent slices.

## Acceptance criteria

- [x] Nodes can be dragged to new positions on the canvas
- [x] Dragging shows visual feedback (node follows cursor, cursor changes to `grabbing`)
- [x] On drop, node position updates in database via `CanvasNodeUpdate` command
- [x] Position updates are debounced to avoid excessive DB writes during drag
- [x] Dragged node renders above other nodes (z-index)
- [x] Drag state is cleared on mouse up or mouse leave
- [x] Integration test: drag node, verify position persisted

## Blocked by

- 02-create-and-view-nodes
