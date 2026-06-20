Status: ready-for-agent

# Trim-then-Join: Blender-Parity Partial-Overlap Area Joining

## Problem

In Blender, joining two areas that share only a partial edge (e.g. a tall left area A, a short bottom-right area C that touches A's lower half) produces an elegant rearrangement: C expands to full width, A shrinks to top-left, everything stays rectangular.

Our current `screen_area_join` (`crates/core/src/graph.rs:644-733`) assumes equal-length shared edges. For partial-overlap pairs it produces non-rectangular geometry, which `validate_screen` rejects. The frontend can't even offer these pairs for joining because `findAdjacentAreas` (`src/ScreenRenderer.tsx:58-64`) requires literal shared vertex IDs, which breaks at T-junctions.

## Goal

Make area joining work for partial-overlap (T-junction) pairs, producing the same clean rectangular result Blender does. The "absorbed" area's overhang should survive as a new area rather than being destroyed.

### Target layout (the Blender result)

```
+--------+-------+        +--------+-------+
|        |   B   |        |   A    |   B   |
|        |       |   →    |        |       |
|   A    +-------+        +--------+-------+
|        |       |        |        C       |
|        |   C   |        |                |
+--------+-------+        +----------------+

join C toward A            A shrinks, C spans full width
```

## Verified findings

| Assumption | Verified reality |
|---|---|
| `get_adjacency` needs relaxing | **Already accepts partial overlaps** — overlap ≥ `MIN_AREA_SIZE` (0.05), no equal-length requirement (`graph.rs:133-155`). |
| Frontend adjacency works | **Frontend is the bottleneck.** `findAdjacentAreas` checks literal vertex-ID membership. At T-junctions, A's long right edge and C's short left edge have different vertex IDs → no pair found → join mode never activates. |
| Backend join handles it | **No.** `screen_area_join` blindly copies the absorbed's outer vertices → non-rectangular result → `validate_screen` rejects. |
| Direction must be in the command | **Not needed.** Backend re-derives direction from `get_adjacency`. Current `sourceAreaId` + `targetAreaId` args are sufficient. |
| Blast radius | **Small.** Only `screen_area_join` (callers: `screen_area_close` + executor `JoinAreas`) and `screen_area_close` (caller: executor `CloseArea`). |

## What to build

### 1. Backend — trim logic in `screen_area_join` (`crates/core/src/graph.rs`)

- Rename current merge body to `screen_area_join_aligned` (private; assumes equal-length shared edges).
- New `screen_area_join` flow:
  1. `get_adjacency` → direction (already works).
  2. Compute overlap interval and how much each area overhangs along the shared axis.
  3. If either area overhangs: split it using `area_split` at the overlap-boundary factor. Track which piece is aligned vs. remainder.
     - **Factor 0.5 caveat:** `area_split` assigns the original ID to the far side when factor ≤ 0.5, and to the near side when factor > 0.5. The trim logic must account for this or compute the correct factor to keep the aligned piece with the right ID.
  4. `screen_area_join_aligned` on the two aligned pieces.
  5. Remainder persists as a new area (not closed) — matches Blender.
- `get_adjacency`, `validate_screen`, `cleanup`: no changes.

### 2. Frontend — adjacency detection (`src/ScreenRenderer.tsx`)

- **Replace `findAdjacentAreas`** (line 58-64) with geometric/bounding-box adjacency that mirrors the backend `get_adjacency` logic:
  - Given the double-clicked edge, look up its endpoint coordinates.
  - For each area, check whether the edge segment is collinear with and overlaps one of the area's four sides.
  - Return the two areas on either side of the edge.
- **Optionally:** carry the `Adjacency` direction in `JoinModeState` for directional overlay rendering (nice-to-have, not required).

### 3. Tests (`crates/core/src/graph.rs`)

- A-B-C scenario: left full-height A, top-right B, bottom-right C. Join C toward A → C becomes full-width bottom, A becomes top-left, B stays top-right.
- Both-sides overhang: where both survivor and absorbed have overhangs.
- No-overhang regression: full-edge join still works (existing tests should still pass).
- Degenerate: overlap < `MIN_AREA_SIZE` → join rejected.
- `validate_screen` passes on all new test screens.

## What does NOT change

- `get_adjacency` — already handles partial overlaps.
- Command interface (`sourceAreaId` + `targetAreaId`) — direction is re-derived on backend.
- `screen_area_close` — automatically benefits from the improved join.
- MCP tool signature.
- Frontend/backend types.

## Acceptance criteria

- [ ] Join C toward A (partial-overlap, T-junction) produces C = full-width bottom, A = top-left, B = top-right — all rectangular, `validate_screen` passes
- [ ] Join A toward C (reverse direction) also works: A expands to full-width left, C splits, B stays top-right
- [ ] Full-edge join (e.g. B toward C in the above layout) still works — no regression
- [ ] `findAdjacentAreas` correctly identifies partial-overlap pairs via geometric adjacency
- [ ] Join mode activates on double-click for partial-overlap pairs ("Click to keep" overlays appear on both areas)
- [ ] Clicking to keep either area dispatches `join_areas` with correct IDs and the backend produces a valid screen
- [ ] Remainder area (the overhang) persists after join — it's not destroyed or merged
- [ ] All 178 existing tests continue to pass
- [ ] New tests cover: partial-overlap join (both directions), both-sides overhang, no-overhang regression, overlap < MIN_AREA_SIZE rejection

## References

- Blender source: `source/blender/editors/screen/screen_edit.cc`
  - `area_getorientation` (line 270) — orientation with partial-overlap tolerance
  - `area_getoffsets` (line 310) — overhang computation
  - `screen_area_trim` (line 505) — split overhanging area before join
  - `screen_area_join_ex` (line 531) — trim-then-join orchestrator
  - `screen_area_join_aligned` (line 462) — the aligned merge step

## Blocked by

None.
