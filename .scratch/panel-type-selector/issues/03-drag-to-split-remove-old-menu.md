# Drag-to-Split from panel corners + Remove old split context menu

Status: ready-for-agent

## Parent

`.scratch/panel-type-selector/PRD.md` — Panel Interaction System

## What to build

Replace the old right-click context menu split ("Split Vertical" / "Split Horizontal") with a drag-to-split interaction from panel corners. Each panel gains invisible split handles in its empty corners (not overlapping the type selector in the top-left). Dragging from a corner creates and previews a split, and committing the drag replaces the Panel node with a Split node where both children inherit the parent's panel type.

In `src/SplitLayout.tsx`:

1. **Remove** the existing right-click context menu on panel surfaces (the overlay with "Split Vertical" / "Split Horizontal" items). The `handleSplit` function and `contextMenu` state for panel surfaces can be removed. This frees the panel surface right-click for future panel-specific context menus.

2. **Add split handles** in the empty corners of each panel. The corners must avoid the type selector button area (top-left). The hit area should be ~16px radius from the corner.

3. **Split overlay**: on mousedown on a corner, enter split-preview mode. A line follows the cursor across the panel surface, oriented based on which corner was grabbed:
   - Top/bottom edges → horizontal split (visually stacked, tree `direction: "horizontal"`)
   - Left/right edges → vertical split (visually side-by-side, tree `direction: "vertical"`)
   - Diagonally opposite corners → split along the longer axis of the panel.

4. **On mouseup**: replace the current Panel node with a Split node. Both children are new Panel nodes with the same `panel_type` as the original. The ratio is the cursor position relative to the panel (clamped to [0.1, 0.9]). Call `onLayoutChange` with the new tree.

5. **Cancel**: pressing Escape or right-clicking during the drag cancels the split and removes the overlay.

6. **Cursor**: change to crosshair when hovering over a corner split handle.

The split handle corners and the type selector button must not overlap — the type selector sits inside the top-left corner padding, and the split handle covers the remaining empty corner space.

The tree mutation follows the existing pattern: `replaceNode(tree, path, newNode)` where the new node is a `Split { direction, ratio, children: [Panel, Panel] }`. No new Tauri commands needed.

## Acceptance criteria

- [ ] Right-clicking a panel surface no longer shows "Split Vertical" / "Split Horizontal" menu items.
- [ ] Hovering over panel corners (except the type-selector-occupied top-left area) changes the cursor to a crosshair.
- [ ] mousedown on a corner starts drag; a split line follows the cursor across the panel.
- [ ] The split line orientation matches the corner grabbed (edge corners produce a split along that axis; diagonal corners split along the longer panel axis).
- [ ] mouseup commits the split: the panel is replaced by a Split node with two child Panel nodes, both preserving the original `panel_type`. The tree is persisted via `onLayoutChange`.
- [ ] The split ratio is clamped to [0.1, 0.9] to prevent invisible panels.
- [ ] Pressing Escape during drag cancels the split (no tree change).
- [ ] Right-clicking during drag cancels the split (no tree change).
- [ ] The drag overlay and line are removed after commit or cancel.

## Blocked by

- `02-panel-type-selector-dropdown.md` (selector occupies top-left corner; split handles must avoid it)

## Comments

The existing Allotment resize-by-dragging-the-border behavior is unchanged and does not need modification. This issue only touches panel surface interaction — not the split border interaction (which is covered in the next issue for Join Area).

