# Polish Dialog and ContextMenu with token foundation

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Refine the existing Dialog and ContextMenu components to adopt the new token foundation and follow the primitive file-layout pattern. The Dialog's CSS import is moved from three consumer files into the Dialog component itself, so adding Dialog to a panel pulls in its styles automatically. The ContextMenu's CSS file is relocated to be co-located with the component. Both components adopt duration, shadow, and radius tokens for their animation timing and visual styling. No visual regressions — they should look and behave identically, just with token-backed values.

## Acceptance criteria

- [ ] Dialog imports its own CSS file internally. The three consumer files that previously imported `Dialog.css` no longer do so.
- [ ] Dialog's enter/exit animation durations reference `--duration-normal` instead of hardcoded `150ms` / `220ms`.
- [ ] Dialog's backdrop, panel shadow, and border radius reference token variables where applicable.
- [ ] ContextMenu's CSS file is relocated to a co-located path alongside the component file.
- [ ] ContextMenu's component file imports the relocated CSS file.
- [ ] ContextMenu's enter/exit animation durations reference `--duration-normal` instead of hardcoded `150ms`.
- [ ] All animation transitions remain gated behind `:root[data-motion="full"]`.
- [ ] Open a Dialog — it enters and exits with the same visual appearance as before. Open a ContextMenu — same.
- [ ] TypeScript compiles with no errors. All existing tests pass.

## Blocked by

Token foundation — spacing, typography, radius, shadow, duration
