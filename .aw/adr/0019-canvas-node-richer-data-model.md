# Canvas nodes: richer data model (title, description, sources)

Canvas nodes carry more structured information than the original free-text `content` field allowed. We are extending the schema:

- `canvas_nodes.content` → `canvas_nodes.title` (rename, plus add `description TEXT`)
- New table `canvas_node_sources` (id, node_id, url, source_type, sort_order, created_at) with FK to canvas_nodes ON DELETE CASCADE

The `metadata_json` field is kept for future extension. A node's visual chrome shows only title, tags, a description snippet, and a source count; the full content is shown in the read-only→edit modal (see [ADR 0018](0018-canvas-adopt-xyflow.md)). This adds one new repository, command variants, CDC event (`CanvasNodeSourcesChanged`), and MCP tools (`node_source_add`, `node_source_list`, `node_source_remove`). Existing MCP tools (`node_create`, `node_update`) gain `title`/`description` params while preserving backward-compatible `content` that maps to `title`.
