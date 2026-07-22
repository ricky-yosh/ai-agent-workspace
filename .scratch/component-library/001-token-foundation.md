# Token foundation — spacing, typography, radius, shadow, duration

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Extend the existing design token system with non-color tokens so every primitive can reference shared layout values instead of hardcoding numbers. Expand `tokens.ts` to define spacing, typography, radius, shadow, and duration tokens. Assign values to every token in all three theme files. After this ticket, a developer can reference `var(--space-4)` or `var(--radius-md)` anywhere in the app and get a consistent value regardless of theme.

## Acceptance criteria

- [ ] `tokens.ts` defines 8 spacing tokens (`--space-1` through `--space-8`), 5 font-size tokens (`--font-size-xs/sm/base/lg/xl`), 4 font-weight tokens (`--font-weight-normal/medium/semibold/bold`), 4 radius tokens (`--radius-sm/md/lg/full`), 3 shadow tokens (`--shadow-sm/md/lg`), and 3 duration tokens (`--duration-fast/normal/slow`).
- [ ] Every new token has a value in the dark theme, the light theme, and the Catppuccin theme. Spacing, radius, duration, and shadow values are identical across all three themes. Font sizes and weights match each theme's existing proportions.
- [ ] Spacing scale: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px.
- [ ] Radius scale: 4px, 6px, 8px, 9999px.
- [ ] Duration scale: 100ms, 200ms, 350ms.
- [ ] `applyTheme()` correctly sets all new tokens on `document.documentElement.style` without error.
- [ ] Existing theme tokens and theme switching behaviour are unchanged.
- [ ] TypeScript compiles with no errors on the theme files.

## Blocked by

None — can start immediately.
