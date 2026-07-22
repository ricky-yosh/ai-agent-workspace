# Badge primitive

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

A reusable Badge primitive for colored label pills. It lives under `src/components/ui/`, uses the `.ui-badge` CSS namespace, imports its own co-located CSS file, and is exported from the barrel `index.ts`. Every layout value references the token foundation. No animations — Badge is presentational.

## Acceptance criteria

- [ ] A Badge component at the standard primitive path, with `variant` (default | success | warning | danger | info), `size` (sm | md), and `children` props.
- [ ] Each variant produces a visually distinct coloured pill using the existing accent, danger, and status theme tokens for background and text colour.
- [ ] The sm size produces a visibly smaller pill than md (less padding, smaller font via `--font-size-xs`).
- [ ] Children text renders inside the pill.
- [ ] All CSS uses `.ui-` prefixed class names, no element-level selectors, and references only token CSS variables for layout values.
- [ ] No CSS transitions or animations — Badge is a presentational component.
- [ ] The CSS file is imported inside the Badge component file, not by consumers.
- [ ] Badge is re-exported from the barrel file.
- [ ] Tests cover: each variant renders the correct class, sm vs md renders the correct class, children text is present in the DOM.
- [ ] TypeScript compiles with no errors. All tests pass.

## Blocked by

Token foundation — spacing, typography, radius, shadow, duration
