# Input primitive

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

A reusable Input primitive with label, error styling, and icon slots. It lives under `src/components/ui/`, uses the `.ui-input` CSS namespace, imports its own co-located CSS file, and is exported from the barrel `index.ts`. Every layout value references the token foundation. The focus ring transition is scoped behind `data-motion="full"`.

## Acceptance criteria

- [ ] An Input component at the standard primitive path, with `label`, `error`, `leadingIcon`, `trailingIcon`, `value`, `onChange`, `placeholder`, `disabled`, and `type` props.
- [ ] The label is rendered as a `<label>` element associated with the input via `htmlFor`/`id`.
- [ ] The error prop (non-empty string) applies an error CSS class to the wrapper and renders the error message below the input in error-styled text.
- [ ] `leadingIcon` and `trailingIcon` render React nodes at the left and right sides of the input respectively.
- [ ] The input fires `onChange` with the entered value on every keystroke.
- [ ] The disabled prop prevents interactions and applies disabled styling.
- [ ] The focus ring appears as a `box-shadow` using the `--accent` token. The transition is gated behind `:root[data-motion="full"]`.
- [ ] All CSS uses `.ui-` prefixed class names, no element-level selectors, and references only token CSS variables for layout values.
- [ ] The CSS file is imported inside the Input component file, not by consumers.
- [ ] Input is re-exported from the barrel file.
- [ ] Tests cover: label renders and associates with input, error class and message appear when error is set, `onChange` fires on text entry, leading/trailing icons render in the DOM, disabled prop prevents interaction, placeholder text appears.
- [ ] TypeScript compiles with no errors. All tests pass.

## Blocked by

Token foundation — spacing, typography, radius, shadow, duration
