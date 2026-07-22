# Migrate file viewer panels — FileViewerPanel and DiffViewerPanel

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace ad-hoc buttons in `FileViewerPanel.tsx` and `DiffViewerPanel.tsx` with the `<Button>` primitive. These panels use tight tab-header layouts with close/add buttons and a `TabButton` component with manual inline-style hover/active management. Replace inline styles with Button variants and let the primitive handle interaction states.

## Acceptance criteria

- [ ] `src/file-panel/FileViewerPanel.tsx` — `.file-viewer-tab-close` (×) → `<Button variant="ghost" size="sm">`. `.file-viewer-tab-add` (+) → `<Button variant="ghost" size="sm">`. Tab close and tab add behaviors preserved.
- [ ] `src/file-panel/DiffViewerPanel.tsx` — TabButton component refactored to use `<Button>` instead of managing hover/active styles inline. Tab activation, close (×), and refresh behaviors preserved.
- [ ] All tab-header layout remains visually correct after the swap (buttons don't break the flex layout or overflow).
- [ ] TypeScript compiles with no errors.
- [ ] Button primitive tests still pass.

## Blocked by

None — can start immediately.
