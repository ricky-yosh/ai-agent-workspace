# 05: General template seed with terminal panel

Status: ready-for-agent

## Parent

PRD: `.scratch/terminal-panel-pty/PRD.md`

## What to build

Update the built-in "General" template to seed with a `"terminal"` panel as its root (instead of `"blank"`), and remove the redundant "Default" template seeding.

End-to-end behavior: when a user opens their first session, the workspace shows a live Terminal Panel — not a blank placeholder. The "Default" template no longer exists.

### General template seed

In the `session_open` autobootstrap path (executor or core crate): when creating the "General" template because it doesn't exist yet, the root panel node should be `{ panel: { panel_type: "terminal" } }` instead of `{ panel: { panel_type: "blank" } }`.

### Remove "Default" template

In `src-tauri/src/lib.rs` (the `run()` or `setup()` function): remove the code that seeds a "Default" template as `built_in: true` on first launch. If this code was already removed (see ADR 0012 amendment), verify it's gone and add a test confirming the "Default" template does not exist.

### ADR 0012

The ADR was already amended to note "Default" removal and "General" with terminal panel. This issue just implements the code change.

## Acceptance criteria

- [ ] Opening a new session with no existing layouts creates the "General" template with `panel_type: "terminal"` as root
- [ ] The "Default" template is never created on app startup
- [ ] Existing "General" templates with `"blank"` panels are unaffected (only applies to new seeds)
- [ ] The Terminal Panel in the General template starts a live PTY when the workspace loads
- [ ] Tests verify the seeded template structure

## Blocked by

- 02-terminal-panel-frontend (needs the `"terminal"` panel type to be registered before seeding)
