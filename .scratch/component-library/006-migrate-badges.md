# Migrate badges — tag-pill and badge spans to Badge primitive

Labels: `in-progress`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace all `.tag-pill` and `.badge` `<span>` elements across the codebase with the `<Badge>` primitive from `src/components/ui/`. Each site gets the appropriate variant and size. Remove the old CSS classes from the span elements; keep existing layout wrappers (like `foreignObject` in SVG contexts) intact.

## Acceptance criteria

- [ ] `src/components/CanvasRenderer.tsx` — `.tag-pill` spans inside SVG `<foreignObject>` swap to `<Badge size="sm" variant="info">`. Badge renders correctly inside the foreignObject context.
- [ ] `src/panels/VisualCanvasPanel.tsx` — `.tag-pill` and `.tag-pill-enter` spans swap to `<Badge size="sm" variant="default">`. The `.tag-pill-enter` animation is preserved via a wrapper or framer-motion rather than the CSS class.
- [ ] `src/PanelActionsModal.tsx` — `.panel-actions-current-badge` span ("active" label) swaps to `<Badge size="sm" variant="info">`.
- [ ] `src/NewWorkspaceModal.tsx` — `.nwm-preview-badge` span ("Built-in" label) swaps to `<Badge size="sm" variant="default">`.
- [ ] TypeScript compiles with no errors.
- [ ] Badge primitive tests still pass.

## Blocked by

None — can start immediately.
