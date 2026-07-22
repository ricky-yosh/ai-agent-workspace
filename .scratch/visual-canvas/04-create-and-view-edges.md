Status: ready-for-agent

# 04: Create and view edges

## What to build

Add directional Edges between Nodes. The AI creates edges via MCP with source, target, and optional label. Edges render as SVG paths with directional arrows. This establishes the edge rendering layer and source/target validation.

## Acceptance criteria

- [ ] `canvas_edges` table exists in the database with all columns (id, canvas_id, source_node_id, target_node_id, label, metadata_json, created_at, updated_at), indices (canvas_id, source_node_id, target_node_id), and SCHEMA_VERSION bumped to 8
- [ ] Migration test asserts the canvas_edges table exists
- [ ] `CanvasEdge` domain struct derives Serialize/Deserialize; `CanvasEdgesChanged { session_id, canvas_id }` domain event variant exists
- [ ] `CanvasEdgeRepository` provides `create`, `list_by_canvas`, `get`, `update`, `delete`; validates source and target nodes exist and belong to the same canvas
- [ ] `CanvasEdgeCreate`, `CanvasEdgeList`, `CanvasEdgeGet`, `CanvasEdgeUpdate`, `CanvasEdgeDelete` command variants exist
- [ ] `CommandResult::CanvasEdge` and `CommandResult::CanvasEdges` variants exist
- [ ] MCP `edge_create`, `edge_list`, `edge_get`, `edge_update`, `edge_delete` tools registered
- [ ] SVG edge rendering as curved path from source to target with directional arrowhead
- [ ] Optional label displayed on edge (midpoint)
- [ ] Edge brush animation when drawing new edge (`.42s` source enter, `.52s` connected confirm)
- [ ] Repository tests: create with valid source/target, reject mismatched canvas, list returns canvas's edges

## Blocked by

- 02-create-and-view-nodes
