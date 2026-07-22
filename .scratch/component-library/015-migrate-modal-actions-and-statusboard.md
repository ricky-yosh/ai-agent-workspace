# Migrate modal action lists, StatusBoard, and PanelTypeSelector

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace ad-hoc buttons in keyboard-navigable modal action lists (`PanelActionsModal`, `TabActionsModal`, `SessionActionsModal`) and standalone complex buttons in `StatusBoard` and `PanelTypeSelector` with `<Button>` primitives. The modal list items have active/confirmed/destructive visual states tied to CSS classes — map these to Button variants. The StatusBoard's snippet-copy button has a 3-state animation (idle/copied/failed) that must be preserved.

## Acceptance criteria

- [ ] `PanelActionsModal.tsx` — `.panel-actions-item` buttons → `<Button variant="ghost">` wrapping the icon + label + badge content. Active/confirmed states mapped to `variant="secondary"` when selected. Keyboard navigation (arrow keys, Enter) preserved.
- [ ] `TabActionsModal.tsx` — `.tab-actions-item` buttons → `<Button variant="ghost">`. Same active/confirmed/keyboard-nav pattern as PanelActionsModal.
- [ ] `SessionActionsModal.tsx` — `.session-actions-item` buttons → `<Button variant="ghost">`. Destructive state → `<Button variant="danger">`. Inline rename `<input>` → `<Input>` with Enter/Escape handlers preserved. Keyboard navigation preserved.
- [ ] `StatusBoard.tsx` — Snippet copy button (`.snippet-copy-btn`) with 3-state animation → `<Button variant="ghost" size="sm">`. Copy/failed/dismiss animation preserved via state-driven children/content swap.
- [ ] `StatusBoard.tsx` — Status card action button (`.status-card-action`) → `<Button variant="ghost" size="sm">`. CTA button (`.status-cta-button`) → `<Button variant="primary">`. Agent selector buttons (`.agent-selector-btn`) → `<Button variant="ghost" size="sm">` with `variant="secondary"` when active.
- [ ] `PanelTypeSelector.tsx` — Pointer-down/up scale transform button → `<Button>` with `data-motion` handling the press animation. Inline styles removed.
- [ ] TypeScript compiles with no errors.
- [ ] Button and Input primitive tests still pass.

## Blocked by

None — can start immediately.
