Status: ready-for-human

# 01: Live resize — direct manipulation under the cursor

> **Implemented (uncommitted).** Built in two bundles: geometry port + parity tests
> (`src/screenGeometry.ts` + `src/screenGeometry.test.ts`), then the draft-screen drag loop +
> preview deletion in `src/ScreenRenderer.tsx` / `.css`. `tsc` clean, 28/28 tests pass. Two
> commit-path safety fixes added beyond the spec: drop the draft on commit-reject and on a
> no-move click (the `[screen]` reset effect only fires when the screen prop actually changes).
> Remaining: eyeball in-app, then commit. Snap cue (dragged sash highlights in the theme accent)
> is a taste/tuning item.

## Parent

[Panel split/join "feel"](README.md)

## Problem

The #1 "feel" gap. Today, dragging a sash shows a **ghost preview line** that follows the cursor;
the panel doesn't actually move until mouse-release, when `resize_edge` round-trips and the whole
screen pops to its new sizes (sash `useEffect` `ScreenRenderer.tsx:201-294`; preview render
`692-715` — *verified, not 684-706 which is the sash render*). Blender resizes the border **live, under the cursor**, with both neighbors reflowing
every frame. The preview-then-commit model is the single biggest thing making the system feel
indirect.

## Why this is cheap (the keystone insight)

`resize_edge` is **pure, portable geometry** — it needs only `vertices` + `edges`, which the
frontend already holds in `screen`. So the client can replicate it exactly, with **zero divergence**
from the backend, and the commit-on-release becomes a visual no-op.

Backend reference (`crates/core/src/graph.rs`):
- `select_connected_vertices(edge_id)` (`:188`) — flood-fill: start from the dragged edge's two
  vertices, repeatedly absorb any edge of the **same orientation** sharing exactly one selected
  vertex. Returns the full divider's vertex set (handles T-junctions).
- `resize_edge` (`:965`) — compute the moving set; for each area derive
  `free_space = dim − MIN_AREA_SIZE` and accumulate `smaller`/`bigger` bounds per side; clamp
  `new_pos` to `[cur − smaller, cur + bigger] ∩ [0,1]`; set every selected vertex's axis-coord to
  the clamped value; then `cleanup()` merges coincident vertices.

`MIN_AREA_SIZE = 0.05`. Panels are keyed by `area.id` (`ScreenRenderer.tsx:742`), so moving
vertices in place keeps every DOM node — including mounted terminals/WebGL — alive.

## What to build

### 1. Port the geometry to TS

New helper (e.g. `src/screenGeometry.ts`): mirror `select_connected_vertices` (pure graph
flood-fill) and the `resize_edge` clamp. Signature roughly:

```
resizeEdgeLocal(screen: Screen, edgeId: string, newPos: number): Screen
```

returning a new `Screen` with the selected vertices moved to the clamped position. **Do not**
replicate `cleanup()` — coincident-vertex merging only changes topology at the moment a divider
meets another vertex; for the live preview the un-cleaned geometry is visually identical
(`cleanup()` never repositions a vertex — it only de-dupes IDs already at the same coord), and the
backend runs the real `cleanup()` on commit.

**Verified algorithm (transcribed from `graph.rs`, port faithfully):**
- `select_connected_vertices` (`:188-250`): seed `selected` with the dragged edge's 2 endpoints;
  loop over all edges, absorb both endpoints of any edge that (a) shares **exactly one** selected
  vertex AND (b) matches the start orientation (`|y1−y2|<EPSILON` ⇒ horizontal else vertical);
  repeat until a full pass adds nothing; return sorted-by-string-id. T-junctions fall out: the
  perpendicular stub shares one vertex but fails orientation, so only the collinear divider grows.
- `resize_edge` clamp (`:965-1037`): `bigger`/`smaller` both start at **`f64::MAX` → use
  `Infinity` in TS** (so a side with no constraining area lets `.clamp(0,1)` dominate — the
  boundary case). Per area: `free_space = dim − MIN_AREA_SIZE`; for a **vertical** edge, if the
  area's left corners (`v1`&`v2`) are selected it's to the right ⇒ `bigger = min(bigger, free)`,
  if right corners (`v3`&`v4`) selected it's to the left ⇒ `smaller`; for a **horizontal** edge,
  bottom corners (`v1`&`v4`) ⇒ `bigger`, top corners (`v2`&`v3`) ⇒ `smaller`. Then
  `clamped = clamp(newPos, cur−smaller, cur+bigger)` and finally `clamp(_, 0, 1)`.

Keep `EPSILON = 1e-6` and `MIN_AREA_SIZE = 0.05` in sync with the Rust constants
(`crates/core/src/domain/screen.rs:5-6`) — a shared note/comment so they don't drift.

### 2. Draft-screen drag loop

In `ScreenRenderer`:
- Add ephemeral `draftScreen` state. The cleanest swap is a single `const activeScreen =
  draftScreen ?? screen` feeding the three derivations that read screen geometry — **all verified**:
  `vertexMap` memo (`:148-154`, the keystone — both sashes and areas resolve coords through it),
  `areasToRender` (`:157-159`), `internalEdges` memo (`:663-666`). Base the memos on `activeScreen`.
- On `mousedown`: **capture the base prop `screen` in a ref** and seed `draftScreen = screen`.
  Feed `resizeEdgeLocal(baseScreenRef, …)` each frame — **never feed the draft back into itself**
  (cumulative drift). The existing drag `useEffect` closes over `screen` directly (`:218,:248`);
  route it through the captured ref so widening deps doesn't re-register listeners mid-drag.
- On `mousemove` (rAF-throttled, as today): snap against the **base** screen — `snapPosition(raw,
  baseScreen, edgeId, isHorizontal)` (`:168-196`, already parameterized) — then
  `draftScreen = resizeEdgeLocal(baseScreen, edgeId, snappedPos)`. The clamp may further constrain
  the snapped value; that's fine (a snap target inside the forbidden zone is silently clamped).
  Every adjacent panel reflows live because they all read the same draft vertex map.
- The already-wired `screen-container--resizing` class keeps the `.screen-area` transition **off**
  during the drag, so panels track the cursor with zero lag.
- On `mouseup`: one `resize_edge` invoke with the **already-snapped** final position (the backend
  clamps but does **not** snap, so send the snapped value the draft used, as today at `:248`) →
  authoritative `current_screen` replaces state. Because the client mirrored the math, the swap is
  visually a no-op; the 0.12 s settle absorbs any sub-pixel rounding.
- **Clear `draftScreen` in the `[screen]` reset effect (`:424-444`), not on `mouseup`.** That effect
  already nulls `sashDrag`/`splitDrag` on any screen change. Gate "render from draft" on
  `draftScreen !== null` (kept alive until the commit lands), **not** on `sashDrag` — `mouseup`
  nulls `sashDrag` synchronously *before* the async commit resolves, so gating on it causes a
  one-frame pop back to the old `screen`.
- On `Escape`: drop `draftScreen`, no commit (current cancel behavior).

### 3. Delete the preview line

Remove the `screen-sash-preview` render block (`ScreenRenderer.tsx:692-715` — *verified range*)
and its CSS (`.screen-sash-preview` + `.screen-sash-preview--snapped`, `ScreenRenderer.css:218-230`;
the snapped variant is the green glow `#22c55e`). The `sashDrag.isSnapped` field goes dead unless
reused for the new snap cue. Snapping now manifests on the **edge itself** (the panel snaps), which
is more direct. Decide what — if anything — replaces the green-glow snap signal now that there's no
ghost line (e.g. a brief tick at the snap coordinate, or a momentary edge highlight). Keep it cheap.

## What does NOT change

- Rust backend / `resize_edge` command — unchanged; still the authority on commit.
- The double-click-to-join and corner-handle-split gestures.
- Screen/Vertex/Edge/Area types.
- The `screen-container--resizing` gate and `.screen-area` transition (already shipped).

## Risks

- **Geometry drift mid-drag.** Mitigated by porting the *exact* rule (not approximating). If the
  ported clamp/flood-fill diverges, the panel will jump on release. Cover with a test that asserts
  `resizeEdgeLocal` matches a set of `resize_edge` fixtures. **Assert on area bounds / vertex
  *coordinates*, NOT on raw vertex-list or edge-list equality** — without `cleanup()` the client
  output keeps duplicate vertices / degenerate edges at a coincident-landing, so list equality
  fails spuriously even though the geometry is visually identical. Port these Rust tests (note two
  live *outside* the `:2161` block — don't treat "2161+" as contiguous):
  `test_resize_edge_vertical` (`:2161`), `_horizontal` (`:2195`), `_clamped` (`:2227`, min-size),
  `_t_junction` (`:2252`, whole divider incl. v5 moves), `_clamped_to_screen_boundary` (`:2531`,
  the `Infinity`/no-area-on-one-side path), and `_merges_coincident_vertices` (`:2656` — the one
  that only passes *with* cleanup; assert coordinates here, expect duplicate-vertex topology).
- **Constant drift.** `MIN_AREA_SIZE`/`EPSILON` must match Rust. Document the coupling.
- **rAF/React cost** with many panels — should be fine (in-place % updates, terminals debounce
  their own resize), but verify on a dense screen.

## Acceptance criteria

- [ ] Dragging a sash moves the divider and reflows both neighbors **live under the cursor**, no ghost line. *(code in place; eyeball)*
- [ ] Mounted terminals/WebGL panels stay alive through the drag (no remount, no blank). *(eyeball — `area.id` keying + 100ms-debounced ResizeObserver verified)*
- [ ] Snapping pulls the **edge** to grid/aligned-vertex positions during the drag. *(snaps against base screen; eyeball)*
- [ ] On release, the committed screen is visually identical to the dragged draft (no pop/jump). *(client mirrors backend math; eyeball)*
- [x] `resizeEdgeLocal` matches `resize_edge` on ported fixtures incl. T-junction + clamp + boundary cases. *(12 parity tests green)*
- [x] Escape cancels with no commit; min-size and `[0,1]` clamps respected during the drag. *(clamp covered by tests; Escape path wired)*
- [x] `prefers-reduced-motion`: drag is still live (it's direct, not animated); only the on-release settle is suppressed. *(unchanged — settle gating already shipped in quick-wins)*

## Blocked by

None. No backend or dependency changes.
