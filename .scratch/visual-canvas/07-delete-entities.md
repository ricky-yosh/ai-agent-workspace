Status: ready-for-agent

# 07: Delete entities

## What to build

Enable deleting Nodes, Edges, and Groups. Deleting a node cascades to remove connected edges and node from groups. Delete animations provide visual feedback.

## Acceptance criteria

- [ ] `CanvasNodeDelete` command removes node and cascades to connected edges and group memberships
- [ ] `CanvasEdgeDelete` command removes edge
- [ ] `CanvasGroupDelete` command removes group (not member nodes)
- [ ] MCP `node_delete`, `edge_delete`, `group_delete` tools work correctly
- [ ] Delete animation: fade out (`.26s` linear ease, no overshoot)
- [ ] Deleting a node removes it from any group's `node_ids_json`
- [ ] Deleting a node removes any edges where it is source or target
- [ ] Cascade test: create node, create edge from node, delete node, verify edge removed
- [ ] Cascade test: create node, create group with node, delete node, verify node removed from group

## Blocked by

- 02-create-and-view-nodes
- 04-create-and-view-edges
- 05-create-and-view-groups
- 06-add-and-view-tags
