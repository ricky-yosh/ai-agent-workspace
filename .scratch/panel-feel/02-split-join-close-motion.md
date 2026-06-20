Status: needs-info

# 02: Split / join / close motion (enter–exit, FLIP)

## Parent

[Panel split/join "feel"](README.md)

## Blocked on a decision

**Hand-rolled WAAPI FLIP vs Framer Motion.** Resolve before building (see README "Open decision").
Lean: hand-rolled WAAPI — no ~30–50 kb dep, full control in a Tauri app with live terminals/WebGL,
and the surface is small. This doc is written approach-agnostic; the chosen tool only changes *how*
the enter/exit and FLIP are expressed.

## Problem

Split/join/close all round-trip and replace the whole screen, so panels **pop** in and out with no
motion. After the quick-wins pass, the *surviving* panels already animate (neighbors reflow via the
`.screen-area` transition on close/join — free, keyed by `area.id`). What still pops is the panel
that **appears** (split) or **disappears** (join/close).

## What to build

Diff previous vs next `screen.areas` by `area.id` to classify each commit:

- **Split (a node is added).** The new panel should **grow from the seam**, not blink in. FLIP it
  from the splitting parent's pre-split rect (clip/scale out from the divider line), then play to
  its final geometry. Origin-aware: motion explains the spatial cause.
- **Join / close (a node is removed).** The dying panel should **collapse/fade out** instead of
  vanishing. This requires briefly **retaining** the removed node as a ghost (it's gone from the
  new `screen.areas`), accelerating it out while survivors slide into the freed space via the
  existing `.screen-area` transition. Join: the discarded panel should read as absorbed *into the
  kept one*.

Mechanics (hand-rolled path): capture rects by `area.id` before applying the new screen (First),
apply (Last), invert + play with the Web Animations API. For removals, keep an "exiting" list of
nodes rendered one extra beat with an exit animation, then drop them. (Framer path: wrap areas in
`AnimatePresence` with `layout` + `exit`; it does First/Last/Invert/Play and exit retention for
you.)

Durations/easing from the cheat-sheet: enter ~200–300 ms decelerate; exit ~200 ms accelerate.
Honor `prefers-reduced-motion` (instant). Coordinate with the in-flight live-resize draft machine
(#1) so a commit's settle and a split/join FLIP don't double-animate the same node.

## What does NOT change

- Backend commands (`split_area`, `join_areas`, `close_area`) and geometry.
- Survivor reflow (already animated via `.screen-area`).
- Types.

## Risks

- **Terminal/WebGL during transform.** A transformed/clipped container may briefly clip xterm/WebGL
  content; verify it's cosmetic (the ResizeObserver is debounced, so no reflow storm). Don't
  transform a node whose content must stay pixel-stable mid-animation longer than necessary.
- **Exit retention vs unmount.** Keeping a dead panel's node alive an extra beat must not re-run its
  effects or hold backend resources (the terminal is already disposed on the join/close path).
- **Interaction with #1.** Build #1 first; reuse its prev/next screen diff if practical.

## Acceptance criteria

- [ ] Splitting a panel: the new panel grows from the split seam (no blink-in).
- [ ] Joining: the discarded panel visibly collapses into the kept panel; survivors slide in smoothly.
- [ ] Closing: the closed panel animates out; neighbors expand into the freed space.
- [ ] No double-animation when a commit settle (#1) and a FLIP touch the same node.
- [ ] Terminals/WebGL survive the animations without remount or lasting artifacts.
- [ ] `prefers-reduced-motion`: enter/exit resolve to instant.

## Blocked by

- The hand-rolled-vs-Framer decision (README).
- Recommend after #1 (live resize) lands, to share the screen-diff/commit machinery.
