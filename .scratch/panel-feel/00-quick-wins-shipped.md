Status: ready-for-human

# Quick wins — shipped (uncommitted)

## Parent

[Panel split/join "feel"](README.md)

## State

Implemented and verified (tsc clean; independent review passed). **Uncommitted** on `main`,
mixed in with other in-progress edits. Touches only `src/ScreenRenderer.tsx` and
`src/ScreenRenderer.css`. Awaiting a commit decision and a visual eyeball of two tuning items
(below).

## What shipped

1. **Geometry transition** on `.screen-area` (`left/top/width/height` 0.12s ease) — resize-commit,
   snap, and neighbor-reflow-after-close now animate while the keyed-by-`area.id` DOM node is
   preserved. Gated off during sash drag via `.screen-container--resizing`; wrapped in
   `prefers-reduced-motion: no-preference`. (`ScreenRenderer.css:13-23`, applied
   `ScreenRenderer.tsx:673`.)
2. **Doubled focus ring fixed** — dropped the redundant `outline`, kept the clean
   `box-shadow: inset`. (`ScreenRenderer.css:25-29`.)
3. **Sash hit target + resting affordance** — faint resting fill + a `::before` pseudo widening
   the pointer grab zone (~12 px) without thickening the visual line. (`ScreenRenderer.css:71-80`.)
4. **Corner split-handles visible at rest** — opacity 0 → 0.22, brightening on area hover.
   (`ScreenRenderer.css:96`.)
5. **Snap feedback beyond color** — green glow on `.screen-sash-preview--snapped` + the line
   thickens 2→3 px on snap. (`ScreenRenderer.css:226`; `ScreenRenderer.tsx:705,710`.)
6. **Listener re-bind bug fixed** — the sash-drag `useEffect` re-bound all document listeners
   every rAF frame (keyed on a fresh `sashDrag` object); now keyed on `[sashDrag?.edgeId,
   sashDrag?.isHorizontal]` so it binds once per drag. Safe because the `[screen]` reset effect
   nulls `sashDrag` on any screen change. (`ScreenRenderer.tsx:294`.)
7. **Cursor + tooltips** — crosshair `body.cursor` during split-drag; `title` hints on sashes and
   corner handles. (`ScreenRenderer.tsx:376/384`, sash `685`, handles `771-787`.)

## Follow-up fix during review

- **Focused-area corner-handle z-index trap** — removed `z-index: 1` from `.screen-area--focused`.
  It created a stacking context that trapped the corner split-handles (z-index 8) below the
  root-level sashes (z-index 5), letting the expanded sash hit-zone steal corner clicks near
  interior junctions. Focused areas now behave like non-focused ones. (`ScreenRenderer.css:25-29`.)

## Open tuning items (eyeball in the running app — taste calls, not bugs)

- **Resting sash fill is solid `#3c3c3c`** (theme `--border-color` is opaque, not the translucent
  fallback). IDE-like visible dividers — probably good, but more present than "faint." Dial to
  e.g. `rgba(255,255,255,0.06)` if too loud.
- **Corner handles show as faint dots at every corner** (4 per panel). Discoverable but can read
  busy with many panels. Lower to ~0.12 or show only on container-hover if so.

## Known nit (out of scope, pre-existing)

`.screen-join-overlay` / `.screen-join-label` hardcode purple `#7c3aed` while the theme accent is
blue `#0078d4` → purple-on-blue join overlays. Fold into #3 (join-as-drag) rework.

## Acceptance

- [x] tsc clean
- [x] independent review passed (all 6 PASS, T2 listener fix confirmed safe)
- [x] focus-ring z-index regression fixed
- [ ] committed
- [ ] two tuning items eyeballed in-app
