# PRD: Panel Interaction System

Status: ready-for-agent

## Problem Statement

Panels in the layout are static — every panel is a "blank" placeholder with no way to change its type, and splitting is buried in a right-click context menu that will eventually be needed for panel-specific actions (terminal copy/paste, log export, etc.). There's no way to undo a split by joining panels back together. The interaction model needs to match Blender's proven approach: type selector in the corner, drag to split from corners, and right-click borders to join.

## Solution

Redesign panel interaction with three mechanisms: (1) a Blender-style dropdown in the top-left corner to switch panel types, (2) drag-from-any-corner to split a panel into two of the same type, and (3) right-click on a split border to join two adjacent panels. The existing right-click-on-panel context menu for splitting is removed to free it for future panel-specific actions.

## User Stories

1. As a user, I want a dropdown in the top-left corner of every panel so that I can change what the panel shows without destroying my layout.
2. As a user, I want the dropdown to list all available panel types with human-readable labels so that I can discover what panels exist.
3. As a user, I want switching panel types to be instant so that I don't lose context while experimenting with my layout.
4. As a user, I want switching a panel type to preserve that panel's position, size, and neighbors so that my layout stays intact.
5. As a user, I want to drag from any corner of a panel to split it into two panels so that I can build complex layouts by hand.
6. As a user, I want splitting a panel to preserve its type so that splitting a Terminal gives me two Terminals (not blank panels).
7. As a user, I want the split to follow my cursor while I drag so that I can position the split exactly where I want it.
8. As a user, I want to see a visual split line while dragging so that I can preview where the split will land.
9. As a user, I want the cursor to change to a crosshair when hovering over panel corners so that I know they're draggable.
10. As a user, I want to right-click on a split border and select "Join Area" so that I can merge two adjacent panels back into one.
11. As a user, I want the Join Area action to show a directional triangle arrow indicating which direction the join will happen so that I know which panel will be consumed.
12. As a user, I want the panel that will be consumed in a join to gray out so that I can visually confirm the action before committing.
13. As a user, I want my cursor to be hidden during Join Area selection so that nothing distracts from the directional arrow.
14. As a user, I want the surviving panel in a join to keep its panel type so that I control which type wins.
15. As a user, I want to resize panels by dragging the split border so that I can adjust proportions after splitting.
16. As a user, I want each panel type to display a human-readable label (not just the internal `panel_type` string) so that the dropdown feels polished.

## Implementation Decisions

### Panel Type Selector

- The `panelRegistry` gains a display label: `registerPanel(type, label, component)`.
- `SplitLayout` renders a small button in the top-left corner of every panel node displaying the current type's label with a dropdown chevron.
- Clicking the button opens a dropdown listing all registered types with their human-readable labels. The current type is highlighted.
- On selection, the panel's `panel_type` in the layout tree is updated via the existing `onLayoutChange` → `invoke("update_workspace_tree")` path.
- When only one panel type is registered, the button is hidden.
- The type selector button occupies the top-left corner; it is distinct from the empty corner space used for split handles.

### Drag-to-Split

- Every panel has split handles in its empty corners (the space NOT occupied by the type selector button or its padding).
- Hovering over a corner changes the cursor to a crosshair and renders an invisible hit area.
- On mousedown on a corner, a split overlay activates: a line follows the cursor across the panel surface. The line is oriented based on which corner was grabbed (top-right → vertical split, bottom-left → horizontal split; diagonally opposite corners split along the longer axis).
- On mouseup, the split commits: the panel is replaced with a binary Split node at the ratio determined by the cursor position.
- Both children inherit the parent panel's `panel_type`. If the parent is `"terminal"`, both children are `"terminal"`.
- The ratio is calculated as the cursor's relative position within the panel (0.0 to 1.0 before clamping to [0.1, 0.9] to prevent invisible panels).
- The split handle hit area should be large enough to be grabbable (~16px radius from the corner) but not overlap the type selector.
- Cancel the split on Escape key or right-click during drag.

### Join Area

- Right-clicking on a split border (an edge between two panels, not a panel surface) opens a context menu with a single "Join Area" item.
- Selecting "Join Area" enters join mode: the cursor is hidden, a large directional triangle arrow appears over the border pointing toward the panel that will be consumed, and that panel's content is visually dimmed (gray overlay at ~50% opacity).
- Moving the mouse across the border flips the triangle direction — the panel the arrow points at is the one that will be consumed.
- Clicking confirms the join: the two adjacent panels merge. The surviving panel is the one the arrow does NOT point at. The Split node is collapsed into the surviving Panel node.
- The surviving panel keeps its `panel_type`. The consumed panel's type is discarded.
- The join cannot cross workspace boundaries or affect panels in a different split subtree — only adjacent sibling panels can be joined.
- Right-click or Escape exits join mode without changes.

### Split Border Rendering

- Split borders (the `Allotment` separator) must be distinct from panel surfaces for right-click targeting.
- The separator bar needs its own right-click handler, separate from the panel wrapper's handler.

### Tree Mutations

- Split: replaces a `Panel` node with a `Split { direction, ratio, children: [Panel, Panel] }` where both children share the parent's `panel_type`. Follows the existing full-tree-replacement pattern.
- Join: collapses a `Split` node into a single `Panel` node keeping the surviving panel's type. The sibling `Panel` at the consumed index is discarded.
- All mutations use the existing `onLayoutChange` → `invoke("update_workspace_tree")` path. No new Tauri commands.

### Removals

- Remove the right-click context menu on panel surfaces ("Split Vertical" / "Split Horizontal"). This frees the panel surface right-click for future panel-specific context menus.

## Testing Decisions

- Panel type selector: verify dropdown renders, selection fires tree update, hidden when one type.
- Drag-to-split: verify corner hit areas exist, crosshair cursor on hover, split line follows cursor, commit creates correct tree with preserved type, Escape cancels.
- Join area: verify right-click on border shows "Join Area", triangle arrow appears, gray overlay on consumed panel, click confirms merge into surviving panel, Escape cancels.
- Verify right-click on panel surface no longer shows split options.
- Verify split borders are independently right-clickable (not intercepted by panel wrapper).
- Good tests exercise external behavior: what the user sees and what the tree looks like after — not internal state transitions.

## Out of Scope

- Corner join (dragging a corner into an adjacent panel to merge) — deferred.
- Drag-and-drop reordering of panels.
- Panel type icons (text labels only for v1).
- Panel type search/filter in the selector dropdown.
- Adding new panel types — this PRD only builds the interaction system around them.

## Further Notes

This is a prerequisite for the Terminal Panel PRD: the type selector must exist before users can switch panels to "Terminal", and the drag-to-split must exist so users can create multiple terminal panels.
