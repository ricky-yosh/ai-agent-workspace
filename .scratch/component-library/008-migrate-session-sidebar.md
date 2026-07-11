# Migrate SessionSidebar — buttons and input

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace all ad-hoc `<button>` elements and `.dialog-btn-*` classes in `SessionSidebar.tsx` with the `<Button>` primitive. Replace the session name `<input>` with `<Input>`. The dropzone is a large clickable area with complex inner content (icon, path, drag-drop states) — treat it as a special case and wrap it with `<Button variant="ghost">` if feasible, or leave as-is with a comment if not.

## Acceptance criteria

- [ ] New Session dialog buttons: Cancel → `<Button variant="ghost">`, Create → `<Button variant="primary" disabled={...}>`. Dialog behavior preserved.
- [ ] Session name `<input className="dialog-input">` → `<Input label="Name" placeholder="Session name">`.
- [ ] Sidebar control buttons: `.sidebar-toggle-btn`, `.sidebar-title-back`, `.new-session-btn`, `.sidebar-collapsed-session` — each swaps to `<Button variant="ghost" size="sm">` with appropriate aria-labels. Collapse/expand/session-switch behavior preserved.
- [ ] `.dialog-dropzone` button — treat as a special case. If the Button primitive's padding/height don't work with the dropzone's inner layout, leave it as-is and add a comment explaining why.
- [ ] `<select>` with `.dialog-input` for recent directories is noted in a comment as not-yet-migrated (no Select primitive exists).
- [ ] TypeScript compiles with no errors.
- [ ] Button and Input primitive tests still pass.

## Blocked by

None — can start immediately.
