# Button primitive

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

A reusable Button primitive with variants, sizes, and built-in animations. It lives under `src/components/ui/`, uses the `.ui-button` CSS namespace, imports its own co-located CSS file, and is exported from a barrel `index.ts`. Every layout value in its CSS references the new token foundation. The Button's press-scale and hover-background animations are scoped behind `data-motion="full"`.

## Acceptance criteria

- [ ] A Button component at the standard primitive path, with `variant` (primary | secondary | danger | ghost), `size` (sm | md), `loading`, `disabled`, `onClick`, and `children` props.
- [ ] Button forwards a ref to its underlying `<button>` element.
- [ ] Each variant produces a visually distinct button (different background/text colours from theme accent/danger/tokens).
- [ ] The sm size produces a visibly smaller button than md (less padding, smaller font via `--font-size-sm`).
- [ ] The loading state renders a spinner inside the button and disables clicks.
- [ ] The disabled state prevents `onClick` from firing.
- [ ] On `:active`, the button scales to 0.97 over `--duration-fast`. On `:hover`, the background shifts over `--duration-fast`. Both transitions are gated behind `:root[data-motion="full"]`.
- [ ] All CSS uses `.ui-` prefixed class names, no element-level selectors, and references only token CSS variables for layout values.
- [ ] The CSS file is imported inside the Button component file, not by consumers.
- [ ] Button is re-exported from the barrel file.
- [ ] Tests cover: each variant renders the correct class, each size renders the correct class, `onClick` fires on click, `onClick` does not fire when disabled, `onClick` does not fire when loading, loading spinner is present during loading, children render inside the button, ref is forwarded.
- [ ] TypeScript compiles with no errors. All tests pass.

## Blocked by

Token foundation — spacing, typography, radius, shadow, duration
