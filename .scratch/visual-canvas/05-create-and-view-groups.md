Status: ready-for-agent

# 05: Create and view groups

## What to build

Add Groups to visually cluster related Nodes. The AI creates groups via MCP with a label and list of node IDs. Groups render as frame containers around their member nodes. The UI handles spatial containment detection for drag-and-drop.

## Acceptance criteria

- [ ] `canvas_groups` table exists in the database with all columns (id, canvas_id, label, node_ids_json, metadata_json, created_at, updated_at), indices (canvas_id), and SCHEMA_VERSION bumped to 9
- [ ] Migration test asserts the canvas_groups table exists
- [ ] `CanvasGroup` domain struct derives Serialize/Deserialize; `CanvasGroupsChanged { session_id, canvas_id }` domain event variant exists
- [ ] `CanvasGroupRepository` provides `create`, `list_by_canvas`, `get`, `update`, `delete`; `update` handles add/remove node_ids
- [ ] `CanvasGroupCreate`, `CanvasGroupList`, `CanvasGroupGet`, `CanvasGroupUpdate`, `CanvasGroupDelete` command variants exist
- [ ] `CommandResult::CanvasGroup` and `CommandResult::CanvasGroups` variants exist
- [ ] MCP `group_create`, `group_list`, `group_get`, `group_update`, `group_delete` tools registered
- [ ] SVG group frame rendering around member nodes with label
- [ ] Group frame resizes to fit contained nodes
- [ ] Group frame animation on creation (`.26s` pop-in)
- [ ] Repository tests: create with node_ids, list returns canvas's groups, update adds/removes nodes, delete removes group

## Blocked by

- 02-create-and-view-nodes
