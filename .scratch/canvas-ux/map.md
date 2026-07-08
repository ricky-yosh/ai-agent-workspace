# Canvas UX — Clapet-inspired interactions, git tree panel

Labels: `wayfinder:map`

## Notes

**Domain**: Visual Canvas panel, C4 Diagram panel, Diff Viewer panel, new Git Tree panel.

**Standing preferences**:
- Colors must follow the app's existing theme (single source of truth), not the clapet teardown palette.
- Extract reusable viewer-dispatch patterns (like file-tree → file-viewer) into shared components.
- Mechanics first, then animations.

**Reference**: `clapet-design-teardown.html` in repo root — source of the interaction patterns.

## Decisions so far

<!-- populated as tickets resolve -->

## Fog

- **C4 annotation/notes model**: Two potential note types (AI-feedback notes vs. user/AI scratchpad notes). Needs investigation into the MCP tool contract (e.g. `get_c4_feedback`) and how notes feed back into `generate_c4_diagram`. Too fuzzy to ticket yet.
- **Animation catalog porting**: The teardown documents 39 CSS keyframes. Which subset to port, in what order, and how they integrate with the existing CDC event-driven animation system. Will become specifiable once the core mechanics are built.
- **Color token unification**: The app may have color tokens defined in multiple places (CSS variables, Tailwind config, inline styles). A single-source-of-truth refactor may touch files beyond the panels being worked on. Scope unclear until investigated.
