Status: ready-for-agent

# 06: Add and view tags

## What to build

Add Tags to Nodes for categorization. The AI adds/removes tags via MCP. Tags display as small labels on nodes with entry animations. Users can filter nodes by tag.

## Acceptance criteria

- [ ] `canvas_tags` table exists in the database with all columns (id, node_id, tag, created_at), indices (node_id, unique node_id+tag), and SCHEMA_VERSION bumped to 10
- [ ] Migration test asserts the canvas_tags table exists
- [ ] `CanvasTag` domain struct derives Serialize/Deserialize; `CanvasTagsChanged { session_id, canvas_id, node_id }` domain event variant exists
- [ ] `CanvasTagRepository` provides `add`, `remove`, `list_by_node`, `list_by_canvas`; enforces unique node_id+tag
- [ ] `CanvasTagAdd`, `CanvasTagRemove`, `CanvasTagList` command variants exist
- [ ] `CommandResult::CanvasTags` variant exists
- [ ] MCP `tag_add`, `tag_remove`, `tag_list` tools registered
- [ ] Tags displayed as small pills on nodes with entry animation (`.26s cubic-bezier(.16,1,.3,1)`)
- [ ] Tag filter UI: click a tag to show only nodes with that tag
- [ ] Repository tests: add tag, remove tag, list by node, list by canvas, duplicate tag rejected

## Blocked by

- 02-create-and-view-nodes
