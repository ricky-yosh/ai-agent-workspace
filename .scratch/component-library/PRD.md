# PRD: Component Library — Design tokens and reusable UI primitives

Labels: `ready-for-agent`

## Problem Statement

A developer adding a new panel or UI feature has no shared vocabulary for spacing, typography, or shape — every file invents its own padding, font-size, and border-radius values. Buttons, inputs, and badges are recreated ad-hoc across 22 CSS files and countless inline style objects with inconsistent styling and no built-in hover/press/focus feedback. The existing theme system defines 40 color tokens but nothing for layout, making "consistent UI" impossible without copy-pasting magic numbers. The existing shared components (Dialog, ContextMenu) import their CSS from outside the component directory, creating fragile coupling between component files and consumer-side stylesheets.

## Solution

Expand the theme system with a complete token foundation for spacing, typography, radius, shadow, and animation duration — a single source of truth for every layout value in the app. Build a small set of reusable, token-backed UI primitives (Button, Input, Badge) with co-located CSS, a `.ui-` class namespace, and built-in hover/press/focus animations that respect the existing `data-motion` contract. Polish the existing Dialog and ContextMenu to use the new tokens. New and existing panels can compose primitives instead of writing ad-hoc inline styles. No existing code is migrated — panels adopt primitives organically as they are touched.

## User Stories

### Token foundation

1. As a developer building UI, I want a spacing scale of 8 steps (--space-1 through --space-8, 4px–48px), so that every component uses the same padding and gap values.
2. As a developer building UI, I want a typography scale of 5 font sizes (xs/sm/base/lg/xl) and 4 font weights (normal/medium/semibold/bold), so that text sizing is consistent everywhere.
3. As a developer building UI, I want a radius scale of 4 sizes (sm/md/lg/full), so that rounded corners follow a single rhythm across all panels.
4. As a developer building UI, I want a shadow scale of 3 levels (sm/md/lg), so that elevation is expressed consistently.
5. As a developer building UI, I want a duration scale of 3 speeds (fast/normal/slow), so that all animations share the same timing vocabulary.
6. As a dark-mode user, I want all new tokens to have values defined in the dark theme, so that spacing and typography don't break when switching themes.
7. As a light-mode user, I want all new tokens to have values defined in the light theme, so that the vocabulary is available regardless of theme choice.
8. As a Catppuccin user, I want all new tokens to have values defined in the Catppuccin theme, so that the token vocabulary is complete across the full theme set.

### Button primitive

9. As a developer, I want a Button primitive with variants (primary, secondary, danger, ghost) as a single prop, so that I can express button intent without inventing CSS for each use case.
10. As a developer, I want a Button primitive with sizes (sm, md) as a single prop, so that compact and standard buttons share the same styling vocabulary.
11. As a user clicking a button, I want to see a press-down scale animation and a hover background change, so that the button feels responsive and physical.
12. As a user with reduced motion, I want the button's press and hover animations to be suppressed when motion is reduced, so that the UI respects my preference.
13. As a developer, I want a Button to accept a loading state (spinner + disabled), so that async actions don't permit double-clicks.
14. As a developer, I want a Button to accept children (text, icons, or both), so that I can compose it with any content.
15. As a developer, I want a Button to forward a ref to its underlying `<button>` element, so that I can programmatically focus it.

### Input primitive

16. As a developer, I want an Input primitive with a label prop, so that every text field has consistent labeling.
17. As a developer, I want an Input primitive with an error prop (message + invalid styling), so that validation feedback looks the same everywhere.
18. As a developer, I want an Input primitive to support leading and trailing icon slots, so that search fields, password toggles, and other decorated inputs follow the same pattern.
19. As a user tabbing through a form, I want the Input to show a visible focus ring, so that I know which field is active.
20. As a developer, I want the Input to accept placeholder text, a disabled state, and standard HTML input type values, so that it can replace every existing text input in the app.
21. As a user with reduced motion, I want the Input's focus ring transition to appear instantly rather than animating.

### Badge primitive

22. As a developer, I want a Badge primitive with semantic variants (default, success, warning, danger, info), so that every label, tag, and status pill in the app uses the same color mapping.
23. As a developer, I want a Badge primitive with sizes (sm, md), so that ref labels in the git graph and status indicators in issue rows can share the same component.
24. As a user, I want Badges to render as compact colored pills with readable text, so that I can scan labels at a glance.

### Dialog primitive polish

25. As a developer using the existing Dialog, I want it to import its own CSS file internally, so that I don't need to remember to import `Dialog.css` in every consumer file.
26. As a user opening a Dialog, I want the enter/exit animations to use the new duration tokens, so that animation timing is consistent with other UI elements.

### ContextMenu primitive polish

27. As a developer using the existing ContextMenu, I want its CSS file to live co-located with the component under `src/components/ui/`, so that the file structure is self-contained.
28. As a user opening a ContextMenu, I want its enter/exit animation to use the new duration tokens, so that opening speed matches other animated elements.

### Developer experience

29. As a developer, I want to import all primitives from a single barrel file (`src/components/ui/index.ts`), so that I don't need to remember individual file paths.
30. As a developer, I want each primitive to import its own co-located CSS file, so that adding a primitive to a panel automatically pulls in its styles without the panel needing to know the CSS path.
31. As a developer grepping for `.button` in CSS, I want the primitive's class name to use a `.ui-` prefix (e.g., `.ui-button`), so that I never collide with existing `.dialog-btn` or `.tag-pill` class names.
32. As a developer running tests, I want each primitive to be testable in isolation via vitest + jsdom, with tests that assert rendered output and behavior rather than internal implementation.

## Implementation Decisions

### Token foundation

- Tokens are added to `tokens.ts` in the existing `TOKENS` map, using semantic names: `SPACE_1` through `SPACE_8`, `FONT_SIZE_XS/SM/BASE/LG/XL`, `FONT_WEIGHT_NORMAL/MEDIUM/SEMIBOLD/BOLD`, `RADIUS_SM/MD/LG/FULL`, `SHADOW_SM/MD/LG`, `DURATION_FAST/NORMAL/SLOW`.
- Each of the three theme files (dark, light, catppuccin) defines values for every new token. Spacing, radius, and shadow values are identical across themes. Duration values are identical. Font size and weight may vary per theme if needed.
- Spacing scale: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px.
- Radius scale: 4px, 6px, 8px, 9999px (pill).
- Duration scale: 100ms (fast, for press/hover micro-interactions), 200ms (normal, for enter/exit transitions), 350ms (slow, for larger animations).

### Component API design

- Button: `variant` (primary | secondary | danger | ghost), `size` (sm | md), `loading` (boolean), `disabled`, `onClick`, `children`, plus forwarded standard button HTML attributes. Press animation: `scale(0.97)` over `--duration-fast` on `:active`. Hover: background shift over `--duration-fast`.
- Input: `label` (string), `error` (string), `leadingIcon` / `trailingIcon` (ReactNode slots), `value` / `onChange` (controlled), `placeholder`, `disabled`, `type`. Focus ring via `box-shadow` using `--accent` color.
- Badge: `variant` (default | success | warning | danger | info), `size` (sm | md), `children`. Variant maps to a CSS class that sets background and text color from existing accent/danger/status tokens.

### CSS architecture

- Every primitive has a co-located `.css` file (e.g. `Button.css` alongside `Button.tsx`) and imports it at the top of the TSX file.
- All class names use the `.ui-` prefix: `.ui-button`, `.ui-button--primary`, `.ui-button--sm`, `.ui-input`, `.ui-input--error`, `.ui-badge`, `.ui-badge--danger`.
- No tag-level selectors (`button`, `input`) — only class selectors, to avoid colliding with existing element-level resets in `LayoutToolbar.css`.
- All layout values (padding, gap, font-size, border-radius) reference CSS variables from the token foundation. No raw px values.

### Animation contract

- Interactive primitives (Button, Input) ship with built-in `:hover`, `:focus`, and `:active` transitions that use `--duration-fast`.
- Container primitives (Dialog, ContextMenu) ship with built-in enter/exit animations that use `--duration-normal`.
- Presentational primitives (Badge) have no animations.
- All CSS transitions are scoped behind `:root[data-motion="full"]` selectors, matching the existing animation gating pattern.
- No new usage of `motion/react` or WAAPI in primitives — CSS transitions are sufficient for primitive-level animations.

### Existing components

- The existing Dialog and ConfirmDialog components are not moved or renamed. Their CSS is updated to use token variables where it references hardcoded values, and the CSS import is moved from consumer files into the Dialog component itself.
- The existing ContextMenu component is not moved or renamed. Its CSS file is moved from `src/ContextMenu.css` to a co-located path, and the component's import path is updated.
- Existing components under `src/components/` that are not primitives (CanvasRenderer, ErrorBoundary, TemplateMiniature, SearchBar, ScrollEdgeCue) are left unchanged.
- No panel CSS files or inline styles are modified. Migration is out of scope.

### File organization

- Primitives live under `src/components/ui/`. Each has three files: `Button.tsx`, `Button.css`, `Button.test.tsx`.
- A barrel `src/components/ui/index.ts` re-exports all primitives by name — no default exports.
- The existing `src/components/` directory remains unchanged; it continues to house non-primitive shared components.

## Testing Decisions

A good test asserts external behavior: what the user sees and interacts with. It does not test internal state or implementation details.

Pattern to follow: `src/components/Dialog.test.tsx` — it renders the component, simulates user interaction (clicks, keyboard), and asserts on rendered DOM (class names, presence/absence of elements, attribute values). It mocks browser APIs (click outside detection) and the animation library.

What to test per primitive:
- **Button**: renders each variant and size with the correct CSS class. Triggers `onClick` on click. Does not trigger `onClick` when disabled or loading. Renders a spinner in loading state. Displays children. Forwards ref.
- **Input**: renders label and associates it with the input via `htmlFor`. Applies error class and displays error message when `error` prop is set. Calls `onChange` on text entry. Renders leading/trailing icon nodes. Disables input when `disabled`.
- **Badge**: renders each variant with the correct CSS class. Renders children text. Renders at correct size.

All tests use vitest + jsdom (matching `vite.config.ts` inline vitest config) with `@testing-library/react` for rendering and queries. Assertions via vitest's `expect` + `@testing-library/jest-dom` matchers.

## Out of Scope

- **Panel migration**: No existing panel, CSS file, or inline style is updated to use the new primitives. Panels adopt primitives organically as they are touched for other work.
- **Storybook / component catalog**: The primitive library ships as code only — no visual documentation or interactive playground in v1.
- **New primitives beyond the core set**: Only Button, Input, Badge, and Dialog/ContextMenu polish are in scope. Additional primitives (Select, Toggle, Tooltip, Table, etc.) are deferred.
- **Canvas-specific primitives**: The canvas panel uses SVG rendering and its own animation system. Primitives are for DOM-based UI panels only.
- **Path aliases**: No `@ui/*` or `@components/*` import aliases are introduced. All imports remain relative.
- **Design token migration**: Existing components and CSS files are not updated to use new tokens. Only the new primitives reference them.

## Further Notes

- The existing theme system already defines 40 color tokens as oklch values and applies them via `applyTheme()` by iterating the `TOKENS` map. Adding layout tokens follows the same mechanism — no architectural changes to the theme engine.
- The `.ui-` class prefix was chosen because `.dialog-btn`, `.tag-pill`, `.context-menu-item`, and other broadly-scoped class selectors already exist in the global CSS namespace and would collide with simpler names like `.button` or `.badge`.
- The existing Dialog component's CSS is currently imported by three consumer files rather than the component itself. The polish step corrects this to match the primitive pattern (component imports its own CSS).
- The `data-motion` attribute on `:root` is the project's motion-reduction mechanism. All animation CSS rules in new primitives must use the `:root[data-motion="full"]` selector prefix to respect this contract.
