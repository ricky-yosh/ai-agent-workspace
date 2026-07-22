# Migrate VisualCanvasPanel — buttons and badges

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace ad-hoc buttons and tag-pill badges in `VisualCanvasPanel.tsx` with `<Button>` and `<Badge>` primitives. The panel uses `motion.button` with inline styles for several controls — swap to `<Button>` and remove the inline style blocks. The tag-pill enter animation (currently via `.tag-pill-enter` CSS class) should be preserved through a framer-motion wrapper or an alternative approach.

## Acceptance criteria

- [ ] Back arrow button → `<Button variant="ghost" size="sm">`. Navigation behavior preserved.
- [ ] Zoom reset button → `<Button variant="ghost" size="sm">`. Zoom reset behavior preserved.
- [ ] Tag filter buttons (including "All") → `<Button variant="ghost" size="sm">` for All, `<Button variant="secondary" size="sm">` for active filter. `activeTagFilter` state drives variant changes. `motion.button` → regular `<Button>`.
- [ ] Tag-pill spans → `<Badge size="sm" variant="default">`. Tag-pill enter animation preserved via wrapper or motion component.
- [ ] All inline styles removed from migrated buttons — styling comes from Button primitive only.
- [ ] TypeScript compiles with no errors.
- [ ] Button and Badge primitive tests still pass.

## Blocked by

None — can start immediately.
