# ADR 0005: Icon Library — Lucide React

**Date:** 2026-06-06

## Status

Accepted

## Context

The app uses icons in several places: sidebar toggle (inline SVG), template management (emoji characters), tab bar (text `+`), close buttons (text `✕`). To maintain visual consistency, tree-shakeable bundle size, and a cohesive developer tool aesthetic, we need a standardized icon library.

Requirements:
- Clean, neutral-geometric style fitting a developer workspace tool
- Tree-shakeable (bundle only what's used)
- Full React/TypeScript support
- Permissive license (no attribution required)
- 1,000+ icons to cover current and future needs

## Decision

Use **Lucide React** (`lucide-react`) as the standard icon library for all UI icons.

### Chosen icons by component

| Component | Before | After (Lucide) |
|---|---|---|
| Sidebar toggle | Inline SVG | `PanelLeftClose` / `PanelLeftOpen` |
| Template manager rename | `✏️` emoji | `Pencil` |
| Template manager delete | `🗑️` emoji | `Trash2` |
| Template manager close | `✕` text | `X` |
| Tab bar add | `+` text | `Plus` |

### Future additions

Any new icon needs should use `lucide-react` rather than inline SVGs or text characters.

### Bundle impact

Lucide React is fully tree-shakeable. Vite/esbuild dead-code elimination ensures only imported icons are bundled. Current usage is ~5 icons (~2 KB gzipped).

## Consequences

### Positive

- Consistent visual language across all UI
- Tree-shakeable — zero overhead for unused icons
- 1,500+ icons available without adding weight
- Active community fork of Feather Icons (ISC license)
- No inline SVG maintenance

### Negative

- Added dependency (~2 KB gzipped for current usage)
- Need to migrate existing inline SVGs and emoji icons

### Neutral

- Icons use `className`, `size`, `strokeWidth` props — consistent with React patterns
- Default `strokeWidth={1.5}` for medium weight
- Size convention: `16` for inline/button icons, `18-20` for larger UI elements
