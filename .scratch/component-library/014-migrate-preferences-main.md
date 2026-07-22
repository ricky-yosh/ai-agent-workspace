# Migrate preferences-main — buttons and input

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace ad-hoc buttons and the custom tool path input in `preferences-main.tsx` with `<Button>` and `<Input>` primitives. Theme cards (visual swatches) and tabs with active state require mapping CSS class names to Button variants. The danger button has a loading state that maps to the Button primitive's `loading` prop.

## Acceptance criteria

- [ ] Theme card buttons (`.theme-card` with swatch previews) → `<Button variant="ghost">` wrapping the swatch content. Selected theme visual indicator preserved via `variant="secondary"` when active.
- [ ] Danger button (`.danger-btn` with loading) → `<Button variant="danger" loading={isLoading}>`. Reset/delete behavior and loading state preserved.
- [ ] Tab buttons (`.tab` with `.active`) → `<Button variant="ghost">` for inactive, `<Button variant="secondary">` for active. Tab switching behavior preserved.
- [ ] Custom tool path `<input className="tool-input">` → `<Input placeholder={placeholder}>`. Conditional visibility and value/onChange binding preserved.
- [ ] `<select>` elements (tool preset, motion preference) noted in comments as not-yet-migrated.
- [ ] TypeScript compiles with no errors.
- [ ] Button and Input primitive tests still pass.

## Blocked by

None — can start immediately.
