# ADR 0004: Layout Template / Workspace Instance Separation

**Date:** 2026-06-06

## Status

Accepted

## Context

The current layout system conflates two distinct concepts:

1. **Global blueprints (Templates)** — the split-panel arrangements saved in `layouts.json`
2. **Active workspace tabs (Instances)** — what the user sees and edits in the tab bar for a given Session

This causes logical inconsistencies:

- Creating a new Session auto-creates a new "Default" Template in `layouts.json`, polluting the global library
- Deleting a tab deletes the Template permanently
- The `+` dropdown shows the same list as the tab bar (Templates), rather than offering Templates to add as new tabs
- All Sessions share the same flat tab list from `layouts.json`; there is no per-Session tab configuration
- Each Session should own its own ordered list of workspace tabs referencing shared Templates

Blender's workspace system solves this by separating saved presets ("Layouts" menu) from active workspace instances (the tab bar). Users add instances of presets, edit them freely, and delete them without affecting the saved preset.

## Decision

Refactor the data model to introduce **Workspace Instances** as a per-Session concept, decoupled from the global **Layout Template** store.

### `layouts.json` (Global Library — immutable during normal use)

```json
[
  { "id": "tmpl_general", "name": "General", "default_tree": { ... } },
  { "id": "tmpl_modeling", "name": "Modeling", "default_tree": { ... } }
]
```

- Read-only catalog of presets.
- Users can explicitly save new templates here ("Save as Template").
- Normal UI operations (rename tab, delete tab, split panels) never mutate this file.

### `sessions.json` (Per-Session Workspace Instances)

```json
{
  "sessions": [
    {
      "id": "session_123",
      "active_workspace_id": "ws_abc",
      "workspaces": [
        {
          "id": "ws_abc",
          "name": "General",
          "template_id": "tmpl_general",
          "current_tree": { ... }
        },
        {
          "id": "ws_xyz",
          "name": "My Custom Sculpting",
          "template_id": "tmpl_modeling",
          "current_tree": { ... }
        }
      ]
    }
  ]
}
```

- Each Session owns a `workspaces` array.
- Each Workspace Instance has a `template_id` referencing its source Template.
- `current_tree` is the editable working tree (auto-saved on split/drag).
- `active_workspace_id` replaces the old `active_layout_id`.

### Unchanged

- `LayoutTree`, `LayoutNode`, `Direction`, `Panel` types remain the same.
- `Allotment`-based SplitLayout rendering remains the same.
- Panel registry (`panelRegistry.tsx`) remains the same.
- `tauri-plugin-dialog`, `tauri-plugin-opener` remain the same.

### Changed Flows

| Flow | Old Behavior | New Behavior |
|---|---|---|
| **New Session** | Creates a new "Default" template in `layouts.json` | Reads `layouts.json` for `tmpl_general`, instantiates a Workspace Instance in the Session's `workspaces` array |
| **Tab Bar** | Renders `presets` (`layouts.json`), highlights by `active_layout_id` | Renders the Session's `workspaces` array, highlights by `active_workspace_id` |
| **`+` Dropdown** | Shows `presets` (same as tab bar) | Shows Layout Templates from `layouts.json`; clicking creates a new Workspace Instance |
| **Delete Tab** | Deletes template from `layouts.json` | Removes Workspace Instance from Session's `workspaces` array |
| **Rename Tab** | Renames template in `layouts.json` | Renames Workspace Instance's `name` field only |
| **Reset to Template** | Clears `active_layout_tree`, falls back to template tree | Copies `default_tree` from source Template back into `current_tree` |
| **Save as Template** | Creates new template (unchanged) | Pushes new Layout Template into `layouts.json` |
| **Override Template** | Copies working tree into template | Removed — instances are always editable; no need to "override" |

### IPC Commands

**New / Changed:**

| Command | Purpose |
|---|---|
| `add_workspace(session_id, template_id) -> WorkspaceInstance` | Instantiate a template as a new workspace tab in the session |
| `remove_workspace(session_id, workspace_id)` | Close a tab (delete instance) |
| `rename_workspace(session_id, workspace_id, new_name)` | Rename a tab |
| `set_active_workspace(session_id, workspace_id)` | Switch active tab |
| `update_workspace_tree(session_id, workspace_id, tree)` | Auto-save on split/drag |
| `reset_workspace_to_template(session_id, workspace_id)` | Re-copy `default_tree` from source template |
| `get_session_workspaces(session_id) -> Vec<WorkspaceInstance>` | Hydrate tab bar on session open |
| `get_active_workspace(session_id) -> WorkspaceInstance` | Get current workspace with resolved tree |

**Unchanged (keep as-is):**

| Command | Purpose |
|---|---|
| `save_layout(name, tree) -> Layout` | Save a new template (global) |
| `list_layouts -> Vec<Layout>` | List all templates (for `+` dropdown) |
| `delete_layout(layout_id)` | Delete a template (explicit user action) |
| `rename_layout(layout_id, new_name)` | Rename a template (explicit user action) |

### Deprecated / Removed

- `update_layout_tree` — replaced by `update_workspace_tree`
- `set_active_layout` — replaced by `set_active_workspace`
- `get_active_layout` — replaced by `get_active_workspace`
- `override_layout_template` — no longer needed
- `reset_layout_to_template` — replaced by `reset_workspace_to_template`
- `active_layout_id` field on `Session` — replaced by `active_workspace_id`
- `active_layout_tree` field on `Session` — replaced by `current_tree` on each `WorkspaceInstance`

### Frontend Changes

- `LayoutTabs.tsx` — refactor to render `workspaces` from Session state, `+` dropdown shows `layouts.json` templates
- `App.tsx` — `handleLayoutChange` → `handleWorkspaceTreeChange`, fetch workspaces instead of layout
- `SplitLayout.tsx` — no change needed (already accepts a tree)
- `SessionSidebar.tsx` — no change needed

## Consequences

### Positive

- Deleting a tab never loses a template
- Multiple Sessions can safely share the same Layout Template
- `+` dropdown offers a meaningful action (create instance from template)
- Tab state is cleanly per-Session
- Blender-like mental model

### Negative

- Significant refactoring of IPC surface and frontend state
- Need to migrate existing `sessions.json` and `layouts.json` (or delete and start fresh)
- Slightly more complex serialization (nested workspaces array)

### Neutral

- All existing `LayoutTree`, `LayoutNode`, panel types remain unchanged
- SplitLayout rendering is untouched

## Migration

Existing users should delete their `sessions.json` and `layouts.json` from `~/Library/Application Support/AI Workspace/` and let the app recreate them on next launch.
