# PRD: Visual Canvas

## Problem Statement

Users need a way to visually map out plans, connections, and ideas in a 2D space. Currently, the AI agent can create Issues for task tracking, but there is no way to visualize relationships between concepts, organize thoughts spatially, or create visual plans that the AI can understand and manipulate. Users want a collaborative canvas where both they and the AI can place nodes, draw connections, and group related items—similar to tools like Clapet, but integrated into the agent workspace.

## Solution

A Visual Canvas panel type that provides an infinite 2D canvas with Nodes, Edges, Groups, and Tags. The AI can create, read, update, and delete all canvas elements via MCP tools. The canvas uses the existing CDC event system for responsive animations when the AI makes changes, giving users clear visual feedback about where the AI is working. The canvas is session-scoped and persists in SQLite alongside Issues.

## User Stories

1. As a user, I want to create a Visual Canvas, so that I can start mapping out my ideas visually
2. As a user, I want to add Nodes to the canvas, so that I can represent concepts, tasks, or artifacts
3. As a user, I want to move Nodes around the canvas, so that I can organize my thoughts spatially
4. As a user, I want to connect Nodes with directional Edges, so that I can show relationships between concepts
5. As a user, I want to label Edges, so that I can describe the nature of each relationship
6. As a user, I want to group related Nodes together, so that I can organize my canvas into logical clusters
7. As a user, I want to add Tags to Nodes, so that I can categorize and filter them
8. As a user, I want to pan and zoom the canvas, so that I can navigate large diagrams
9. As a user, I want the AI to create Nodes on the canvas, so that it can visualize plans for me
10. As a user, I want the AI to connect Nodes with Edges, so that it can show relationships between ideas
11. As a user, I want the AI to group related Nodes, so that it can organize my canvas logically
12. As a user, I want to see animations when the AI creates or modifies elements, so that I can follow where the AI is working
13. As a user, I want to edit Node content by clicking on it, so that I can update labels easily
14. As a user, I want to delete Nodes, Edges, and Groups, so that I can clean up my canvas
15. As a user, I want to see Tags displayed on Nodes, so that I can quickly see categories
16. As a user, I want to filter Nodes by Tag, so that I can focus on specific categories
17. As a user, I want to create multiple Visual Canvases per session, so that I can organize different plans separately
18. As a user, I want to rename my Visual Canvases, so that I can keep them organized
19. As a user, I want the canvas to remember my view position, so that I don't lose my place when switching panels
20. As a user, I want to select multiple Nodes, so that I can move or delete them together
21. As a user, I want to see a minimap for large canvases, so that I can navigate quickly
22. As a user, I want to snap Nodes to a grid, so that I can align them neatly
23. As a user, I want to change Node colors, so that I can visually distinguish different types
24. As a user, I want to resize Nodes, so that I can fit more content or emphasize important items
25. As a user, I want to add metadata to Nodes, so that I can attach arbitrary context
26. As a user, I want the AI to read the canvas state, so that it can understand my current visual plan
27. As a user, I want the AI to update Node positions, so that it can reorganize my canvas
28. As a user, I want the AI to add Tags to Nodes, so that it can categorize items for me
29. As a user, I want the AI to create Groups of related Nodes, so that it can organize my thoughts
30. As a user, I want the AI to delete elements I no longer need, so that it can clean up my canvas
31. As a user, I want to undo my changes, so that I can revert unwanted modifications
32. As a user, I want to redo my changes, so that I can restore undone actions
33. As a user, I want to see which elements the AI has modified, so that I can review its work
34. As a user, I want the canvas to work alongside other panels, so that I can use it with terminals and file viewers
35. As a user, I want the canvas to persist across sessions, so that I don't lose my work
36. As a user, I want to export my canvas as an image, so that I can share it with others
37. As a user, I want to import a canvas from a file, so that I can restore a previous state
38. As a user, I want to search for Nodes by content, so that I can find specific items quickly
39. As a user, I want to see a list of all Nodes, so that I can get an overview of my canvas
40. As a user, I want to collapse Groups, so that I can simplify the view
41. As a user, I want to expand Groups, so that I can see their contents

## Implementation Decisions

### Database Schema

New tables for Visual Canvas entities:

- `visual_canvases` table: `id`, `session_id` (FK to sessions), `name`, `created_at`, `updated_at`
- `canvas_nodes` table: `id`, `canvas_id` (FK to visual_canvases), `content`, `x`, `y`, `width`, `height`, `metadata_json`, `created_at`, `updated_at`
- `canvas_edges` table: `id`, `canvas_id` (FK to visual_canvases), `source_node_id`, `target_node_id`, `label`, `metadata_json`, `created_at`, `updated_at`
- `canvas_groups` table: `id`, `canvas_id` (FK to visual_canvases), `label`, `node_ids_json` (JSON array of node IDs), `metadata_json`, `created_at`, `updated_at`
- `canvas_tags` table: `id`, `node_id` (FK to canvas_nodes), `tag`, `created_at`

All tables use `ON DELETE CASCADE` for parent references.

### Domain Events

New `DomainEvent` variants for Visual Canvas mutations:
- `VisualCanvasesChanged { session_id }`
- `CanvasNodesChanged { session_id, canvas_id }`
- `CanvasEdgesChanged { session_id, canvas_id }`
- `CanvasGroupsChanged { session_id, canvas_id }`
- `CanvasTagsChanged { session_id, canvas_id, node_id }`

### Commands

New `Command` variants for Visual Canvas operations:
- `VisualCanvasCreate { session_id, name }`
- `VisualCanvasList { session_id }`
- `VisualCanvasGet { session_id, canvas_id }`
- `VisualCanvasDelete { session_id, canvas_id }`
- `VisualCanvasRename { session_id, canvas_id, new_name }`
- `CanvasNodeCreate { session_id, canvas_id, content, x, y, metadata_json }`
- `CanvasNodeUpdate { session_id, node_id, content, x, y, width, height, metadata_json }`
- `CanvasNodeDelete { session_id, node_id }`
- `CanvasEdgeCreate { session_id, canvas_id, source_node_id, target_node_id, label, metadata_json }`
- `CanvasEdgeUpdate { session_id, edge_id, label, metadata_json }`
- `CanvasEdgeDelete { session_id, edge_id }`
- `CanvasGroupCreate { session_id, canvas_id, label, node_ids, metadata_json }`
- `CanvasGroupUpdate { session_id, group_id, label, node_ids, metadata_json }`
- `CanvasGroupDelete { session_id, group_id }`
- `CanvasTagAdd { session_id, node_id, tag }`
- `CanvasTagRemove { session_id, node_id, tag }`
- `CanvasTagList { session_id, canvas_id }`

All commands are serializable and return `ExecutionOutcome` with `DomainEvents`, enabling undo/redo functionality.

### MCP Tools

New MCP tools following existing patterns:
- `canvas_create`, `canvas_list`, `canvas_get`, `canvas_delete`, `canvas_rename`
- `node_create`, `node_update`, `node_delete`
- `edge_create`, `edge_update`, `edge_delete`
- `group_create`, `group_update`, `group_delete`
- `tag_add`, `tag_remove`, `tag_list`

All tools return JSON and trigger CDC events for animations.

### Repositories

New repository structs:
- `VisualCanvasRepository` - CRUD for canvases
- `CanvasNodeRepository` - CRUD for nodes
- `CanvasEdgeRepository` - CRUD for edges
- `CanvasGroupRepository` - CRUD for groups
- `CanvasTagRepository` - CRUD for tags

All repositories follow existing patterns (no traits, concrete structs with `&Connection`).

### Frontend

New `VisualCanvasPanel` component registered in `panelRegistry.tsx`. Uses SVG rendering (like Clapet) with separate layers for nodes, edges, labels, and shockwave animations. Implements infinite canvas with pan/zoom via CSS transforms.

Cursor states:
- `grab` for panning
- `grabbing` for active panning
- `crosshair` for drawing edges
- `pointer` for clicking elements
- `text` for editing labels

Animation system uses CDC events to trigger node pop-in, edge brush states, and group frame animations.

### Integration

- Visual Canvas Panel is a new panel type selectable via `change_panel_type`
- Canvas data is session-scoped and persists in SQLite
- Independent from Issues (no cross-referencing in v1)
- Uses existing CDC event system for AI-driven mutations
- Follows existing command/repository/MCP patterns
- Command system enables undo/redo for all canvas operations
- MCP tools allow AI to edit the Visual Canvas alongside the user

## Testing Decisions

### What Makes a Good Test

- Tests should verify external behavior, not implementation details
- Tests should be isolated and not depend on shared state
- Tests should cover both happy path and error cases
- Tests should verify CDC events are emitted correctly

### Modules to Test

1. **VisualCanvasRepository** - CRUD operations, cascade deletes
2. **CanvasNodeRepository** - CRUD operations, position updates
3. **CanvasEdgeRepository** - CRUD operations, source/target validation
4. **CanvasGroupRepository** - CRUD operations, node_ids management
5. **CanvasTagRepository** - CRUD operations, uniqueness constraints
6. **Command execution** - All Visual Canvas commands, error handling
7. **MCP tools** - All canvas tools, JSON serialization
8. **CDC events** - Event emission for all mutations
9. **Undo/redo** - Command reversal for all canvas operations

### Prior Art

- `issue_repository.rs` - Pattern for session-scoped CRUD
- `workspace_repository.rs` - Pattern for cascade deletes
- `command.rs` - Pattern for command variants
- `mcp/src/lib.rs` - Pattern for MCP tool definitions
- `IssueTrackerPanel.tsx` - Pattern for panel implementation
- `screenMotion.ts` - Pattern for animation system
- Command system - Pattern for undo/redo functionality

## Out of Scope

- Comments or annotation system on canvas elements
- Real-time collaboration between multiple users
- Canvas sharing or publishing
- Import/export functionality
- Minimap or overview panel
- Grid snapping
- Node color customization
- Node resizing
- Canvas templates
- Integration with external diagram tools

## Further Notes

### Design Reference

The Clapet teardown (`clapet-design-teardown.html`) provides excellent reference for:
- SVG rendering architecture (separate layers for nodes, edges, labels)
- Animation system (39 hand-tuned CSS keyframes)
- Cursor states (grab, crosshair, pointer, text)
- Edge brush abstraction (source, captured, connected states)
- Group node frames
- Tag entry animations

### Future Enhancements

- Node color themes (matching Clapet's category colors)
- Edge labels with pop-in animations
- Group collapse/expand
- Canvas templates
- Minimap for large canvases
- Grid snapping
- Node resizing
- Export to image/SVG
- Import from JSON
