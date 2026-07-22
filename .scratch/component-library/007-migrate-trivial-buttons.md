# Migrate trivial button swaps — 8 files

Labels: `ready-for-agent`

## Parent

`.scratch/component-library/PRD.md`

## What to build

Replace simple `<button>` elements and `.dialog-btn` / `.dialog-btn-*` classes across 8 files with the `<Button>` primitive. These are all straightforward swaps — no complex state coupling, no inline styles that encode logic, no keyboard-navigation list patterns.

## Acceptance criteria

- [ ] `src/components/ConfirmDialog.tsx` — 2 buttons: destructive action → `<Button variant="danger">`, cancel → `<Button variant="secondary">` or `variant="ghost"`. `destructive` / `onCancel` / `onConfirm` props preserved.
- [ ] `src/Toast.tsx` — 2 buttons: toast action → `<Button variant="ghost" size="sm">`, close (×) → `<Button variant="ghost" size="sm">`. Toast dismiss/callback behavior preserved.
- [ ] `src/components/ErrorBoundary.tsx` — 1 "Try again" button → `<Button variant="primary" size="sm">`. Error reset behavior preserved.
- [ ] `src/App.tsx` — 2 dialog buttons in "Save as Template" section: Cancel → `<Button variant="ghost">`, Save → `<Button variant="primary">`. Also swaps the template name `<input>` with `.dialog-input` to `<Input label="Template name">`.
- [ ] `src/IssueTrackerPanel.tsx` — 1 filter-clear button (×) → `<Button variant="ghost" size="sm">`. Filter clear behavior preserved.
- [ ] `src/GettingStartedPanel.tsx` — 2 buttons: "New Workspace" and "Show Shortcuts" → `<Button variant="secondary" size="md">`. OnClick behaviors preserved.
- [ ] `src/LayoutTabs.tsx` — 1 add-tab button (+) → `<Button variant="ghost" size="sm">`. Tab-add behavior preserved. Also swaps the inline rename `<input>` to `<Input>` (Enter/Escape handlers preserved).
- [ ] `src/file-panel/FileTreePanel.tsx` — 1 toggle-hidden-files button → `<Button variant="ghost" size="sm">`. Toggle behavior preserved.
- [ ] TypeScript compiles with no errors.
- [ ] Button and Input primitive tests still pass.

## Blocked by

None — can start immediately.
