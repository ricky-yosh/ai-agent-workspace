Status: ready-for-agent

# 01: Create and view canvas

## What to build

The thinnest end-to-end path for Visual Canvas: the AI creates a canvas via MCP, it's stored in SQLite, and the user sees it in a live-refreshing Visual Canvas panel. This establishes the full plumbing — schema, domain types, repository, commands, MCP tools with cross-cutting event wiring, and the React panel — so every subsequent slice only adds behavior on top.

## Acceptance criteria

- [ ] `visual_canvases` table exists in the database with all columns (id, session_id, name, created_at, updated_at), indices (session_id), and SCHEMA_VERSION bumped to 6
- [ ] Migration test asserts the visual_canvases table exists; schema version assertion updated from 5 to 6
- [ ] `VisualCanvas` domain struct derives Serialize/Deserialize; `VisualCanvasesChanged { session_id }` domain event variant exists
- [ ] `VisualCanvasRepository` provides `create`, `list_by_session`, `get`, `delete`, `rename`
- [ ] `VisualCanvasCreate`, `VisualCanvasList`, `VisualCanvasGet`, `VisualCanvasDelete`, `VisualCanvasRename` command variants exist in the executor; mutations emit `VisualCanvasesChanged`
- [ ] `CommandResult::VisualCanvas` and `CommandResult::VisualCanvases` variants exist
- [ ] Tauri `list_visual_canvases` read-only command handler registered in `generate_handler!`
- [ ] MCP `canvas_create`, `canvas_list`, `canvas_get`, `canvas_delete`, `canvas_rename` tools registered in `tool_box!`
- [ ] Cross-cutting MCP wiring: `VisualCanvasesChanged` arm in `invoke_callbacks` with canvas callback param
- [ ] `VisualCanvasPanel` React component registered as panel type `"visual-canvas"` (label "Visual Canvas"); fetches canvases on mount via `list_visual_canvases`; listens to `"visual-canvases-changed"` filtered by `session_id`; shows empty state when no canvases exist
- [ ] `src/App.tsx` side-effect imports `VisualCanvasPanel`
- [ ] Repository tests: create with name, list returns session's canvases, get by id, delete cascades, rename updates name

## Blocked by

None — can start immediately.
