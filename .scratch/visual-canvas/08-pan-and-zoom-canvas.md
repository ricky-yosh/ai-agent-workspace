Status: ready-for-agent

# 08: Pan and zoom canvas

## What to build

Implement infinite canvas with pan and zoom. Users grab to pan, scroll to zoom. Canvas remembers view position per session. This establishes the navigation system for large diagrams.

## Acceptance criteria

- [ ] Canvas supports grab cursor for panning (cursor changes to `grab`)
- [ ] Click and drag on empty canvas pans the view (cursor changes to `grabbing`)
- [ ] Mouse wheel zooms in/out centered on cursor position
- [ ] Zoom has min/max limits (e.g., 10% to 500%)
- [ ] Canvas transform uses CSS `transform: translate(x, y) scale(z)`
- [ ] View position persists per canvas in database (new columns or separate table)
- [ ] Restoring canvas restores last view position
- [ ] Pan/zoom does not affect node positions (only viewport)
- [ ] Performance: pan/zoom at 60fps with 100+ nodes

## Blocked by

- 01-create-and-view-canvas
