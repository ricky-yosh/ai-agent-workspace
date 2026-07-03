Status: ready-for-agent

# 10: CDC events for AI mutations

## What to build

Wire up CDC events for all Visual Canvas mutations so the frontend animates when the AI creates, updates, or deletes elements. This completes the AI-to-UI feedback loop.

## Acceptance criteria

- [ ] All canvas mutation commands emit appropriate DomainEvents (VisualCanvasesChanged, CanvasNodesChanged, CanvasEdgesChanged, CanvasGroupsChanged, CanvasTagsChanged)
- [ ] MCP invoke_callbacks handles all canvas event variants with appropriate callbacks
- [ ] Tauri events emitted: `"visual-canvases-changed"`, `"canvas-nodes-changed"`, `"canvas-edges-changed"`, `"canvas-groups-changed"`, `"canvas-tags-changed"`
- [ ] Panel listens to all canvas events filtered by session_id and canvas_id
- [ ] Node creation triggers pop-in animation
- [ ] Node update triggers position/content animation
- [ ] Edge creation triggers brush animation
- [ ] Group creation triggers frame animation
- [ ] Tag addition triggers tag entry animation
- [ ] Delete triggers fade-out animation
- [ ] Test: MCP node_create, verify animation triggered in frontend

## Blocked by

- 01-create-and-view-canvas
- 02-create-and-view-nodes
- 04-create-and-view-edges
- 05-create-and-view-groups
- 06-add-and-view-tags
