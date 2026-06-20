Status: ready-for-agent

# 03: Join as a direct drag (Blender-style)

## Parent

[Panel split/join "feel"](README.md)

## Problem

Today, joining is a **hidden, mode-based** flow: double-click a sash (no affordance signals it's
double-clickable) → both adjacent areas show an identical dashed "Click to keep" overlay → click
the survivor (`handleSashDoubleClick` `ScreenRenderer.tsx:874`; join-mode `useEffect` `~479`;
`handleJoinAreaClick` `~921`). The symmetric overlay shows neither the direction of the merge nor
which panel loses its content.

Blender has **no separate join gesture and no mode**. Split and join are one continuous
**corner** drag: grab a corner and pull. If the cursor stays in the same area you get a **split**;
if the cursor crosses into a **neighbor**, that neighbor is **absorbed** (join). The sash is *always*
a resize. The outcome is legible before release: the doomed area darkens and the cursor becomes a
directional arrow.

Verified against Blender source (`source/blender/editors/screen/`):
`actionzone_modal`/`actionzone_invoke` (`screen_ops.cc:1300-1466`), `area_join_*`
(`screen_ops.cc:4448-4708`), `screen_area_join_*` (`screen_edit.cc:418-556`),
`screen_draw_join_highlight` (`screen_draw.cc:380-457`).

## The Blender model (what we're matching)

- **Trigger is the corner, not the sash.** We already have a corner-drag: `handleCornerMouseDown`
  (`ScreenRenderer.tsx:888`) + the split modal `useEffect` (`~383`) currently start a **split**.
  This item *extends that same gesture* with a join branch. The sash gesture is untouched (resize only).
- **Split vs join = which area the cursor is in.** Each `mousemove`, resolve the area under the
  cursor by point-in-rectangle (Blender's `BKE_screen_find_area_xy`). Cursor in the **grabbed area**
  → split. Cursor in a **different, joinable area** → join. Not on any joinable area → invalid.
- **Absorbed vs survivor (important, counterintuitive but correct):** the area whose corner you
  **grabbed survives** and grows; the area you **drag *into* is absorbed/deleted**. (Blender:
  `sa1` = grabbed = kept, `sa2` = dragged-into = removed, `screen_ops.cc:4449-4450`,
  `screen_edit.cc:454`.) Maps to our backend as **`targetAreaId` = grabbed (survivor),
  `sourceAreaId` = dragged-into (absorbed)** — note the param names are inverted vs Blender's sa1/sa2.
- **Thresholds:** join commits sooner than split. Blender uses join `0.6·widget_unit` (~12px),
  split `1.2·widget_unit` (~24px). We already use `MIN_DRAG_DISTANCE = 24` for split; add a smaller
  join threshold (~12px).
- **Feedback is darken + cursor, no drawn arrow.** Blender darkens the to-be-absorbed area
  (`rgba(0,0,0,0.7)`), draws a faint white outline on the resulting combined rect
  (inner `rgba(255,255,255,0.1)`, outline `0.4`), eases in over ~150ms, and turns the *cursor* into a
  directional arrow. There is **no arrow drawn on the panel.**

## Scope boundary (important)

This is **trigger + live feedback only**. The `join_areas` command and its geometry are **unchanged** —
the partial-overlap / T-junction correctness (trim-then-join) is **already implemented in the backend**
(`crates/core/src/graph.rs`: `screen_area_join` + `screen_area_join_aligned`). So this item:
- adds no backend changes,
- does not touch join geometry,
- folds in the one remaining *frontend* piece of trim-then-join (the `findAdjacentAreas` geometric
  rewrite) so adjacency is T-junction-correct for the new gesture.

## What to build

### Geometry foundation (pure, unit-tested)
- **Point-in-area hit test** (new). Cursor client coords → normalized (extract the existing
  conversion at `ScreenRenderer.tsx:265`) → which area's bounds contain it (reuse `rawAreaBounds`
  in `src/screenMotion.ts`). This drives the per-`mousemove` "which area am I in" resolution.
- **`findAdjacentAreas` rewrite** (`ScreenRenderer.tsx:68`). Replace the vertex-ID overlap version
  with geometric bounding-box adjacency mirroring backend `get_adjacency`, so T-junctions resolve to
  the correct neighbor (the current version returns >2 and the double-click guard bails). Used to
  *validate* that the cursor's area is a legal join target. **This is the trim-then-join frontend piece.**
- **Orientation helper** (port of Blender `area_getorientation`): grabbed area + target area →
  direction (for the cursor) + joinable check.

### Gesture
- Extend `SplitDragState` with `mode: "split" | "join"` and `targetAreaId`.
- In the corner modal (`handleCornerMouseDown` + split `useEffect` `~383`), each `mousemove`
  hit-test the cursor's area and classify:
  - **same area** → split (existing behaviour, threshold ~24px),
  - **different joinable area** → join (threshold ~12px); absorbed = area-under-cursor,
    survivor = grabbed area,
  - **non-joinable / no area** → invalid; `not-allowed` cursor.
- Directional CSS cursor toward the join per Blender. Escape / right-click cancel are already wired
  into this effect (`~444-457`).

### Commit (reuse the existing path)
- On release in join mode past threshold, reuse `handleJoinAreaClick`'s core (`~921`):
  `safeInvoke("join_areas", { sourceAreaId: absorbedId, targetAreaId: survivorId })`, with
  `disposeTerminal(absorbed.terminal_id)` **before** the invoke, then `onScreenChange`.

### Feedback (faithful Blender)
- Darken the to-be-absorbed area `rgba(0,0,0,0.7)`; faint white outline on the combined rect
  (`inner 0.1 / outline 0.4`). 150ms ease-in gated behind `@media (prefers-reduced-motion: no-preference)`,
  instant otherwise. The cursor is the directional arrow — **do not draw an arrow on the panel.**
- Local React state, instant; no backend round-trip for the preview.

### Cleanup
- **Keep the double-click / "Click to keep" path** as an accessibility fallback (don't delete it).
- Fix the pre-existing accent mismatch: `.screen-join-overlay` / `.screen-join-label` hardcode purple
  `#7c3aed` / `rgba(124,58,237,…)` while the theme accent is blue `#0078d4` (`App.css:10`). Update
  `ScreenRenderer.css:172-186` (and the sash/split-preview purples at `:65,:205`) to
  `var(--accent-color, #0078d4)`.

## What does NOT change

- `join_areas` command, args, and geometry (backend trim-then-join already shipped).
- The sash gesture (always resize) and the split commit.
- Types (`src/types/screen.ts`).

## Risks

- **Sharing the corner gesture state.** Split and join now flow through the same modal; the
  classification must be re-evaluated every `mousemove` (cursor can cross back and forth before
  release). Keep `mode` in the drag state, not a separate ref.
- **Directional resolution at T-junctions.** "Which neighbor is under the cursor" is a point-in-rect
  test, and legality leans on the rewritten geometric `findAdjacentAreas`. Get the adjacency rewrite
  right first (Bundle A).
- **Absorbed-vs-survivor must match Blender exactly** (drag-into dies). Easy to invert; covered by an
  explicit acceptance test.

## Acceptance criteria

- [ ] Dragging a panel's **corner into a neighbor** darkens that neighbor and shows a directional
      **cursor** before commit; staying inside the area still splits.
- [ ] Release commits `join_areas` with **survivor = grabbed area** (`targetAreaId`) and
      **absorbed = dragged-into area** (`sourceAreaId`); absorbed terminal disposed.
- [ ] Join threshold (~12px) is shorter than split threshold (~24px); the gesture never collides with
      sash resize (sash stays resize-only).
- [ ] Works at T-junctions via the rewritten geometric `findAdjacentAreas`.
- [ ] Double-click → "Click to keep" still works as a fallback.
- [ ] Join overlays use the theme accent, not hardcoded purple.
- [ ] Escape / right-click cancels cleanly.
- [ ] Feedback respects `prefers-reduced-motion`.

## Blocked by

- Nothing blocking: trim-then-join **backend** has shipped. This item absorbs trim-then-join's
  remaining **frontend** `findAdjacentAreas` rewrite — note that in `.scratch/trim-then-join/ISSUE.md`
  so the join path isn't reviewed twice.
