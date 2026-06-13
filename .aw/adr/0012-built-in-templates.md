# ADR 0012: Built-In Layout Templates

## Status

Accepted (amended: "Default" template removed as redundant; "General" now seeds with `"terminal"` panel type)

## Context

The app auto-seeds a "General" layout template when a session is opened for the first time (no templates exist in `layouts.json`). Prior to this ADR, that "General" template was indistinguishable from user-created templates — it could be deleted or renamed, leaving sessions with no templates to bootstrap from.

Additionally, `session_open` resolved the first template in the list (`layouts.first()`) rather than looking for "General" by name. If a user had created a custom template before opening their first session, that unrelated template would become the fallback, which was surprising.

The Tauri app previously seeded a "Default" template on first launch with the same vulnerability — this was later removed as redundant (amendment).

## Decision

1. **Add a `built_in: bool` field to the `Layout` struct**. `#[serde(default)]` ensures backward compatibility with existing `layouts.json` files that lack the field (deserializes to `false`).

2. **Protect built-in templates from deletion and renaming**. `LayoutStore::delete_layout` and `rename_layout` reject built-in templates with a `LayoutError::BuiltIn(name)` error, mapped to MCP error code `-32602` (invalid input).

3. **Seed "General" as the sole built-in template during `session_open` autobootstrap**. When a session is opened with no workspaces:
   - Look for a template named `"General"` by name (not `layouts.first()`).
   - If found, use it as-is.
   - If not found, create it with `built_in: true` and a single `"terminal"` panel as its root.
   - The former "Default" template (seeded by the Tauri app) is removed — "General" is the single built-in template.

4. **User-created templates are always `built_in: false`**. The `TemplateSave` command passes `built_in: false` unconditionally.

5. **No auto-delete cascade**. Deleting a template does not walk sessions to clean up workspace instances referencing it. This is deferred until workspace validation is implemented.

## Consequences

- "General" is the sole built-in template — a permanent seed layout that survives all user cleanup. It now seeds with a `"terminal"` panel root.
- User-created templates remain freely deleteable and renamable.
- `session_open` is idempotent: opening any session always finds or creates the same "General" template, never a random user template.
- Existing `layouts.json` files without `built_in` fields deserialize with `built_in: false` — effectively treating all legacy templates as user-created (deletable).
- The `Layout` struct gains one serialized field, increasing `layouts.json` footprint by ~15 bytes per entry.
