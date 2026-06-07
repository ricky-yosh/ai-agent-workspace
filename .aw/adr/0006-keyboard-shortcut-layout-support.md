# ADR 0006: Keyboard Shortcut Layout Support — `e.key` for Letter Shortcuts

**Date:** 2026-06-06

## Status

Accepted

## Context

The app defines global keyboard shortcuts using `⌘N`, `⌘W`, `⌘\`, etc. The initial implementation used `e.code` (physical key position) to detect shortcuts, e.g. `e.code === "KeyN"`. While `e.code` is layout-agnostic (it identifies the physical key cap position on a standard ANSI keyboard), this breaks for non-QWERTY users.

On a **Colemak** layout, for example:
- The `N` character is typed by the physical key at the QWERTY `H` position (`e.code === "KeyH"`)
- The physical key at the QWERTY `N` position (`e.code === "KeyN"`) produces `K`

So a Colemak user pressing `⌘` + the key labeled **N** triggers `e.code === "KeyH"`, and the shortcut is never matched.

The same applies to `W` and any other letter-based shortcut if that letter occupies a different physical position on another layout.

## Decision

Use `e.key` (the typed character) for all **letter-based** keyboard shortcuts, and `e.code` only for **symbol/non-letter keys** (e.g. Backslash, BracketLeft, BracketRight).

Rationale:
- `e.key` returns the character the user expects to type (lowercase), respecting their active keyboard layout.
- Symbol keys (like `\`, `[`, `]`, Tab) have no layout-dependent character remapping in common alternative layouts (Colemak, Dvorak, etc.) — `e.code` is fine for those.
- Users think of shortcuts by the label on the key, not the physical QWERTY position — especially non-QWERTY typists who may use blank keycaps or have muscle memory for their layout's positions.

### Implementation

```ts
// Letter-based — use e.key (layout-aware)
if (e.key === "n") { /* ⌘N */ }
if (e.key === "w") { /* ⌘W */ }

// Symbol/position-based — use e.code (physical position)
if (e.code === "Backslash")    { /* ⌘\ */ }
if (e.code === "BracketLeft")  { /* [ key */ }
if (e.code === "BracketRight") { /* ] key */ }
```

## Consequences

### Positive

- Non-QWERTY users (Colemak, Dvorak, AZERTY, etc.) can use letter shortcuts by their layout's key labels.

### Negative

- `e.key` returns different values for different keyboard layouts — a `⌘Z` shortcut would need to handle multiple possible `e.key` values on some layouts. (Mitigation: we only use `e.key` for the most common letters, and test against the layouts we expect to support.)

### Neutral

- `e.key` returns lowercase when `e.shiftKey` is not pressed — our modifier checks already guard against the shift case, so the matching is straightforward.
