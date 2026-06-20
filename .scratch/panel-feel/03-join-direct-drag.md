Status: ready-for-agent

# 03: Join as a direct drag (Blender-style)

## Parent

[Panel split/join "feel"](README.md)

## Problem

Today, joining is a **hidden, mode-based** flow: double-click a sash (no affordance signals it's
double-clickable) → both adjacent areas show an identical dashed "Click to keep" overlay → click
the survivor (`handleSashDoubleClick` `ScreenRenderer.tsx:470-482`; join-mode `useEffect`
`~390-416`; `handleJoinAreaClick` `~517-547`). The symmetric overlay shows neither the direction
of the merge nor which panel loses its content.

Blender uses one continuous gesture: drag from a corner/border **outward onto a neighbor**; that
neighbor **darkens with a directional arrow** showing it'll be absorbed; release commits. No mode,
no second click, and the destructive outcome is legible before commit
(`source/blender/editors/screen/screen_ops.cc`: `actionzone_modal`, `gesture_dir`, the dark overlaid
arrow on "the area that will be closed").

## Scope boundary (important)

This is **trigger + live feedback only**. The `join_areas` command and its geometry
(`sourceAreaId` + `targetAreaId`) are **unchanged** — that geometry is exactly the surface the
in-flight **`.scratch/trim-then-join`** work owns (partial-overlap/T-junction correctness). So this
item:
- adds no backend changes,
- does not touch join geometry,
- has **no code conflict** with trim-then-join, but should be **sequenced around** it so the join
  path isn't reviewed twice.

## What to build

- **Gesture.** On a sash (or corner) `mousedown` + drag past threshold, resolve the neighbor under
  the cursor each `mousemove` (reuse `findAdjacentAreas` to get the two candidates; pick by cursor
  side). That neighbor is the one to be absorbed.
- **Live feedback (local React state, instant).** Darken the to-be-absorbed neighbor and draw a
  directional arrow toward the survivor. Update continuously as the cursor crosses the sash.
  `not-allowed` cursor when the drag is below threshold or the join is illegal.
- **Commit on release** via the existing `join_areas` with the resolved `sourceAreaId` (absorbed) +
  `targetAreaId` (survivor). Dispose the absorbed terminal as `handleJoinAreaClick` does today.
- **Keep the double-click / "Click to keep" path** as an accessibility fallback (don't delete it).
- While at it, fix the pre-existing accent mismatch: `.screen-join-overlay` / `.screen-join-label`
  hardcode purple `#7c3aed` while the theme accent is blue `#0078d4` (`ScreenRenderer.css:~150-176`).

## What does NOT change

- `join_areas` command, args, and geometry (owned by trim-then-join).
- Split and resize gestures.
- Types.

## Risks

- **Gesture collision** with sash resize (#1 live resize) and corner-handle split — a sash drag now
  has two meanings (resize vs initiate-join). Disambiguate by drag direction/target (perpendicular
  across the sash onto a neighbor = join; along/within = resize) or reserve a modifier/corner. Settle
  this against #1's drag handling.
- **Directional resolution** at T-junctions — which neighbor is "under the cursor" when the sash
  borders more than two areas. Lean on `findAdjacentAreas` semantics.

## Acceptance criteria

- [ ] Dragging from a sash onto a neighbor darkens that neighbor with a directional arrow before commit.
- [ ] Release commits `join_areas` with correct survivor/absorbed IDs; absorbed terminal disposed.
- [ ] The gesture does not collide with resize/split (clear disambiguation rule).
- [ ] Double-click → "Click to keep" still works as a fallback.
- [ ] Join overlays use the theme accent, not hardcoded purple.
- [ ] Escape/right-click cancels cleanly.

## Blocked by

- Sequence around `.scratch/trim-then-join` (no code conflict; avoids double review of the join path).
- Settle gesture disambiguation against #1 (live resize).
