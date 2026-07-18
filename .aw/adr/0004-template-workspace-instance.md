# ADR 0004: Layout Template / Workspace Instance Separation

## Status

Accepted

## Context

The layout system conflated two distinct concepts: **Templates** (global split-panel blueprints saved in `layouts.json`) and **Instances** (the workspace tabs a user sees and edits per Session). Because tabs *were* templates, creating a Session polluted the global library with a "Default" template, deleting a tab permanently deleted a template, all Sessions shared one flat tab list, and the `+` dropdown offered no meaningful action. Blender solves this by separating saved presets from active workspace instances: users add instances of a preset, edit them freely, and delete them without touching the preset.

## Decision

Introduce **Workspace Instances** as a per-Session concept decoupled from the global **Layout Template** store.

- `layouts.json` becomes a read-only catalog of Templates, mutated only by explicit "Save as / delete / rename Template" actions — never by normal tab operations.
- Each Session owns an ordered `workspaces` array. Each Workspace Instance carries a `template_id` (its source preset) and a `current_tree` (the editable, auto-saved working tree). `active_workspace_id` tracks the selected tab.
- Tab operations act on instances: the `+` dropdown instantiates a Template as a new instance; rename/delete/reset affect only the instance; "Reset to Template" re-copies the source `default_tree`.
- The old layout-centric commands/fields (`*_layout*`, `active_layout_id`, `override_layout_template`) are replaced by workspace-centric equivalents. `LayoutTree`/`LayoutNode`/`Panel` types and SplitLayout rendering are unchanged.

## Consequences

- Deleting a tab never loses a Template; multiple Sessions safely share one Template; tab state is cleanly per-Session (Blender-like model).
- Significant refactor of the IPC surface and frontend state; nested `workspaces` serialization is slightly more complex.
- Breaking change to persisted state: existing users delete `sessions.json`/`layouts.json` from the app-support dir and let the app recreate them.
