# Migrate C4DiagramPanel — buttons and input

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace all inline-styled buttons and the diagram rename input in `panels/C4DiagramPanel.tsx` with `<Button>` and `<Input>` primitives. This is the most heavily inline-styled panel — 9 buttons with full inline style blocks. The migration removes all inline styles and lets primitives handle appearance, while preserving conditional state styles (e.g., copy confirmation "Copied!" feedback, delete confirmation).

## Acceptance criteria

- [ ] Copy prompt button → `<Button variant="secondary" size="sm">`. Copy-to-clipboard with "Copied!" state feedback preserved (use Button's `children` or an adjacent indicator).
- [ ] Rename button → `<Button variant="ghost" size="sm">`. Rename mode toggle preserved.
- [ ] Delete button → `<Button variant="danger" size="sm">`. Delete confirmation state preserved.
- [ ] Cancel button → `<Button variant="ghost" size="sm">`. Cancel behavior preserved.
- [ ] Back-to-diagram button → `<Button variant="ghost" size="sm">`. Navigation behavior preserved.
- [ ] Copy diagram button → `<Button variant="ghost" size="sm">`. Diagram copy behavior preserved.
- [ ] Zoom reset button → `<Button variant="ghost" size="sm">`. Zoom reset behavior preserved.
- [ ] Breadcrumb back button → `<Button variant="ghost" size="sm">`. Breadcrumb navigation preserved.
- [ ] Inline rename `<input>` → `<Input>`. AutoFocus, Enter/Escape key handlers, and stopPropagation preserved.
- [ ] All inline styles removed from migrated controls.
- [ ] TypeScript compiles with no errors.
- [ ] Button and Input primitive tests still pass.

## Blocked by

None — can start immediately.
