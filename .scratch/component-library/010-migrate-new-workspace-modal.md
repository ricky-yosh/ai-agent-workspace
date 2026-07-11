# Migrate NewWorkspaceModal — buttons, input, and badge

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace all ad-hoc buttons, the inline rename input, and the preview badge in `NewWorkspaceModal.tsx` with the `<Button>`, `<Input>`, and `<Badge>` primitives. The edit-toggle and sort buttons have multi-state visuals (on/off, sort direction) tied to CSS class names — map these to Button variants while preserving the state logic.

## Acceptance criteria

- [ ] Edit toggle button (`.nwm-edit-toggle`) → `<Button variant="ghost" size="sm">`. Toggle on/off visual state preserved via `variant` prop driven by existing state.
- [ ] Sort direction button (`.nwm-sort-btn`) → `<Button variant="ghost" size="sm">`. Sort direction visual preserved.
- [ ] Manager buttons (`.nwm-manager-btn`, `.nwm-manager-btn--delete`) → `<Button variant="ghost" size="sm">` for rename, `<Button variant="danger" size="sm">` for delete (with confirmation state). Delete confirmation behavior preserved.
- [ ] Inline rename `<input className="nwm-manager-rename-input">` → `<Input>`. AutoFocus, Enter-to-commit, Escape-to-cancel, and stopPropagation behavior preserved.
- [ ] "Built-in" preview badge (`.nwm-preview-badge` span) → `<Badge size="sm" variant="default">`.
- [ ] Disabled state for built-in template buttons preserved.
- [ ] TypeScript compiles with no errors.
- [ ] Button, Input, and Badge primitive tests still pass.

## Blocked by

None — can start immediately.
