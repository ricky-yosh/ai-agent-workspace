Status: ready-for-agent

# 11: Undo/redo for canvas operations

## What to build

Enable undo/redo for all canvas operations. The command system's serializable commands and DomainEvents enable reversing mutations. This gives users safety to experiment with AI-driven changes.

## Acceptance criteria

- [ ] All canvas commands are reversible (implement reverse command generation)
- [ ] Undo stack maintained per canvas (last N commands)
- [ ] Redo stack maintained per canvas
- [ ] Undo reverts last command, moves to redo stack
- [ ] Redo reapplies undone command, moves to undo stack
- [ ] New command clears redo stack
- [ ] Keyboard shortcuts: Cmd+Z undo, Cmd+Shift+Z redo
- [ ] Visual feedback: toast or badge showing undo/redo count
- [ ] Test: create node, undo, verify node removed, redo, verify node restored

## Blocked by

- 01-create-and-view-canvas
- 02-create-and-view-nodes
- 04-create-and-view-edges
- 05-create-and-view-groups
- 06-add-and-view-tags
