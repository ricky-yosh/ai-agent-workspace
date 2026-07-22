# Viewer dispatch pattern — extract reusable component

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## What to build

Generalize the `ViewerRegistry` so it supports dispatching to viewer panels beyond file-views. A viewer panel registers with a `contentType` (e.g., `"file"`, `"diff"`). Dispatchers — like the file tree or the new git tree — ask for the last-focused viewer of a given type. The existing `PanelActionBridge` (the simpler parallel pattern used for diff-viewer dispatch) is absorbed into this abstraction so there's one pattern, not two.

The file tree → file viewer dispatch must work exactly as before. The git tree panel (next issue) will consume this abstraction.

## Acceptance criteria

- [ ] File tree click → opens file in last-focused file viewer (existing behavior, no regression)
- [ ] File tree click with no existing file viewer → creates one and opens the file (existing behavior, no regression)
- [ ] AI-triggered `open-file-request` events → open in last-focused file viewer (existing behavior, no regression)
- [ ] New viewer panels can register with a `contentType` other than `"file"`
- [ ] `PanelActionBridge` is either removed or refactored to delegate to `ViewerRegistry`
- [ ] Existing tests for FileTreePanel and FileViewerPanel still pass

## Blocked by

None — can start immediately.
