# ADR 0012: Built-In Layout Templates

## Status

Accepted (amended: "Default" template removed as redundant; "General" now seeds with a `"terminal"` panel)

## Context

The app auto-seeds a "General" template when a session is first opened with no templates. That seed was indistinguishable from user-created templates — it could be deleted or renamed, leaving sessions with nothing to bootstrap from. Worse, `session_open` fell back to `layouts.first()` rather than "General" by name, so a user's unrelated custom template could surprisingly become the bootstrap. (A separate "Default" template seeded by the Tauri app had the same flaw and was removed as redundant.)

## Decision

Mark the seed template as built-in and protect it. A `built_in: bool` field is added to `Layout` (`#[serde(default)]` keeps legacy `layouts.json` readable, defaulting to `false`, so all pre-existing templates remain user-owned and deletable). `delete_layout`/`rename_layout` reject built-in templates (`LayoutError::BuiltIn`, MCP `-32602`). `session_open` resolves "General" *by name* — using it if present, otherwise creating it with `built_in: true` and a single `"terminal"` root — so bootstrap is idempotent and never grabs a random user template. User-created templates are always `built_in: false`. Deleting a template does not cascade-clean workspace instances referencing it (deferred to workspace validation).

## Consequences

- "General" is a permanent seed that survives all user cleanup; `session_open` is idempotent.
- User templates stay freely deletable/renamable; legacy templates are treated as user-created.
- `Layout` gains one small serialized field.
