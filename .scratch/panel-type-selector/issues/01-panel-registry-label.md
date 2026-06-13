# Add display label to panelRegistry

Status: ready-for-agent

## Parent

`.scratch/panel-type-selector/PRD.md` — Panel Interaction System

## What to build

Add a human-readable display label to the panel registry so every panel type carries a user-facing name alongside its internal type string. This is the foundation for the Panel Type Selector dropdown (next issue).

In `src/panelRegistry.tsx`:

- Change `registerPanel` to accept a display label: `registerPanel(type, label, component)`.
- Add `getPanelLabel(type): string | undefined` — returns the label for a given type.
- Add `listPanelTypes(): { type: string, label: string }[]` — returns all registered types with their labels, for populating the selector dropdown.

In `src/BlankPanel.tsx`:

- Update the registration call to include `"Blank"` as the label.

## Acceptance criteria

- [ ] `registerPanel("blank", "Blank", BlankPanel)` stores the label and can be retrieved via `getPanelLabel("blank")`.
- [ ] `listPanelTypes()` returns `[{ type: "blank", label: "Blank" }]` after BlankPanel registers.
- [ ] `getPanelLabel("nonexistent")` returns `undefined`.
- [ ] Existing `getPanel()` behavior is unchanged — still returns the component.

## Blocked by

None — can start immediately.

## Comments

