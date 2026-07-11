# Migrate GitTreePanel — buttons and inputs

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace all inline-styled buttons and the commit filter input in `panels/GitTreePanel.tsx` with `<Button>` and `<Input>` primitives. This panel currently has every control button fully inline-styled (border, padding, font-size, background) — the migration removes all inline style blocks and lets the primitives handle appearance.

## Acceptance criteria

- [ ] Refresh button → `<Button variant="ghost" size="sm">`. Git refresh behavior preserved.
- [ ] Close/dismiss button → `<Button variant="ghost" size="sm">`. Panel close behavior preserved.
- [ ] Copy commit hash button → `<Button variant="ghost" size="sm">`. Hash copy-to-clipboard behavior preserved.
- [ ] Toggle file view button (tree/flat) → `<Button variant="ghost" size="sm">`. View toggle + keyboard shortcut (`Ctrl+T`) preserved.
- [ ] Commit filter `<input>` → `<Input placeholder="Filter commits...">`. Search/filter behavior preserved.
- [ ] `<select>` for search field type (keyword/author/date) noted in a comment as not-yet-migrated.
- [ ] All inline styles removed from migrated controls.
- [ ] TypeScript compiles with no errors.
- [ ] Button and Input primitive tests still pass.

## Blocked by

None — can start immediately.
