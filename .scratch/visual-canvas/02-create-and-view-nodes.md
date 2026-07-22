Status: ready-for-agent

# 02: Create and view nodes

## What to build

Add Nodes to the Visual Canvas. The AI creates nodes via MCP with content, position, and optional metadata. Nodes render as SVG elements on the canvas with pop-in animations. This establishes the node rendering layer and position-based layout system.

## Acceptance criteria

- [ ] `canvas_nodes` table exists in the database with all columns (id, canvas_id, content, x, y, width, height, metadata_json, created_at, updated_at), indices (canvas_id), and SCHEMA_VERSION bumped to 7
- [ ] Migration test asserts the canvas_nodes table exists
- [ ] `CanvasNode` domain struct derives Serialize/Deserialize; `CanvasNodesChanged { session_id, canvas_id }` domain event variant exists
- [ ] `CanvasNodeRepository` provides `create`, `list_by_canvas`, `get`, `update`, `delete`
- [ ] `CanvasNodeCreate`, `CanvasNodeList`, `CanvasNodeGet`, `CanvasNodeUpdate`, `CanvasNodeDelete` command variants exist
- [ ] `CommandResult::CanvasNode` and `CommandResult::CanvasNodes` variants exist
- [ ] MCP `node_create`, `node_list`, `node_get`, `node_update`, `node_delete` tools registered
- [ ] SVG node rendering on canvas with content display, positioned at (x, y)
- [ ] Node pop-in animation on creation (`.62s cubic-bezier(.19,1.42,.36,1)` spring)
- [ ] Nodes are clickable (pointer cursor)
- [ ] Repository tests: create with content/position, list returns canvas's nodes, update position, delete removes node

## Blocked by

- 01-create-and-view-canvas
