# Join Area via border right-click

Status: ready-for-agent

## Parent

`.scratch/panel-type-selector/PRD.md` — Panel Interaction System

## What to build

Add the ability to merge two adjacent panels by right-clicking their shared split border and selecting "Join Area". This replaces the removed "Split Vertical/Horizontal" context menu (done in the previous issue) with the inverse operation — collapsing a Split node back into a single Panel.

In `src/SplitLayout.tsx`:

1. **Border right-click handler**: the Allotment separator bar needs its own right-click handler, separate from the panel wrapper. When right-clicked, show a context menu with a single "Join Area" item. Ensure the separator's event handler is not intercepted by surrounding panel wrappers (this may require CSS `pointer-events` or z-index adjustments on the Allotment grip element).

2. **Join mode**: selecting "Join Area" enters join mode:
   - The cursor is hidden (`document.body.style.cursor = "none"`).
   - A large directional triangle arrow is rendered over the border, pointing toward the panel that will be consumed.
   - The consumed panel's content is dimmed with a gray overlay (~50% opacity).
   - Moving the mouse across the border flips the triangle direction — the panel the arrow points at is consumed.

3. **Confirm**: clicking anywhere confirms the join. The Split node is collapsed into a single Panel node containing the surviving panel (the one the arrow does NOT point at). The surviving panel keeps its `panel_type`. The consumed panel is discarded. Call `onLayoutChange` with the new tree.

4. **Cancel**: right-clicking again or pressing Escape exits join mode without changes. The cursor reappears and overlays are removed.

5. **Constraints**: the join only operates on adjacent sibling panels — it cannot cross workspace boundaries or affect panels in a different split subtree. Only split borders between sibling panels can be joined.

The tree mutation collapses a `Split` node into a `Panel` node, keeping the surviving panel's type, using the existing full-tree-replacement pattern via `onLayoutChange` → `invoke("update_workspace_tree")`.

## Acceptance criteria

- [ ] Right-clicking a split border (the Allotment separator bar) opens a context menu with "Join Area".
- [ ] The border right-click is not intercepted by the panel wrapper — it fires independently.
- [ ] Selecting "Join Area" hides the cursor and shows a directional triangle arrow over the border.
- [ ] Moving the mouse across the border flips the triangle direction (arrow points at the panel that will be consumed).
- [ ] The consumed panel is visually dimmed (gray overlay) while the surviving panel remains unchanged.
- [ ] Clicking confirms the join: the Split node becomes a single Panel node with the surviving panel's `panel_type`. The tree is persisted.
- [ ] Right-click or Escape exits join mode without changing the tree. Cursor and overlays are restored.
- [ ] Joining two panels where one is a subtree of the other (not siblings) is not possible — only adjacent siblings can be joined.

## Blocked by

- `03-drag-to-split-remove-old-menu.md` (border right-click handler must be distinct from the removed panel-surface right-click menu)

## Comments

The join operation is the inverse of drag-to-split: split replaces a Panel with a Split node, join collapses a Split node into a Panel. Both operations are pure tree mutations with no new Tauri commands.

