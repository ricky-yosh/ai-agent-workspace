# ADR 0005: Icon Library — Lucide React

## Status

Accepted

## Context

Icons were ad-hoc across the app: inline SVG (sidebar toggle), emoji (template management), and text glyphs (`+`, `✕`). We want one standardized library that is clean and neutral-geometric, tree-shakeable, fully typed for React, permissively licensed (no attribution), and broad enough to cover future needs.

## Decision

Use **Lucide React** (`lucide-react`, an ISC-licensed community fork of Feather Icons) as the standard icon library for all UI icons. Existing inline SVGs and emoji are migrated to Lucide components, and any new icon need uses Lucide rather than inline SVG or text glyphs. Icons follow React conventions (`className`, `size`, `strokeWidth`) with a default `strokeWidth` of 1.5 and a size convention of 16 for inline/button icons, 18–20 for larger UI.

## Consequences

- Consistent visual language; fully tree-shakeable, so unused icons add zero weight (current usage ~2 KB gzipped).
- Adds one dependency and requires a one-time migration of existing inline SVGs and emoji.
