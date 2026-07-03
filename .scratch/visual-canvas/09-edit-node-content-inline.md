Status: ready-for-agent

# 09: Edit node content inline

## What to build

Enable clicking a node to edit its content inline. Double-click enters edit mode, showing a text input. Confirm saves to database, cancel reverts. This completes the node content lifecycle.

## Acceptance criteria

- [ ] Double-click on node enters edit mode
- [ ] Edit mode shows text input with current content, cursor changes to `text`
- [ ] Enter confirms edit, Escape cancels
- [ ] Click outside confirms edit
- [ ] Confirm saves new content via `CanvasNodeUpdate` command
- [ ] Cancel reverts to original content
- [ ] Empty content is rejected (minimum 1 character)
- [ ] Edit state clears on canvas pan/zoom
- [ ] Integration test: double-click, type, enter, verify content updated

## Blocked by

- 02-create-and-view-nodes
