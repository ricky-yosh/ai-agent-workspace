# Panel Type Selector dropdown

Status: ready-for-agent

## Parent

`.scratch/panel-type-selector/PRD.md` — Panel Interaction System

## What to build

Add a Blender-style dropdown in the top-left corner of every panel that lets users switch the panel's type without destroying the layout. Render a small button displaying the current type's human-readable label and a chevron. Clicking the button opens a dropdown listing all registered panel types. Selecting a type updates the panel's `panel_type` in the layout tree and persists it to the backend.

In `src/SplitLayout.tsx`:

- In the panel rendering branch of `renderNode`, render a `PanelTypeSelector` component in the top-left corner of the panel wrapper.
- On selection, replace the panel node in the tree with a new panel node of the selected type, then call `onLayoutChange` — this triggers the existing `invoke("update_workspace_tree")` path.

The selector button occupies the top-left corner space. It must be visually distinct from the empty corner area that will later be used for split handles. When only one panel type is registered (e.g., just "Blank"), hide the selector button entirely.

Use the `listPanelTypes()` and `getPanelLabel()` functions from the panel registry (added in the previous issue) to populate the dropdown.

## Acceptance criteria

- [ ] A button with the current panel type label and a chevron appears in the top-left corner of every panel.
- [ ] Clicking the button opens a dropdown showing all registered panel types with their human-readable labels. The current type is highlighted.
- [ ] Selecting a different type updates the panel's `panel_type` in the tree, fires `onLayoutChange`, and persists via `invoke("update_workspace_tree")`.
- [ ] Selecting the same type (already current) is a no-op.
- [ ] When only one panel type is registered, the selector button is not rendered.
- [ ] The selector button does not cause layout shift or overlap panel content.

## Blocked by

- `01-panel-registry-label.md` (panelRegistry must expose labels and listing)

## Comments

Until the Terminal Panel PRD adds a second panel type, the selector will be hidden at runtime (only "Blank" exists). Tests must verify it renders correctly when multiple types are registered — register a stub type in test setup.

