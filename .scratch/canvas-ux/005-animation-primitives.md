# Animation primitives — keyframe catalog port

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## What to build

Extract the inline `<style>` block from VisualCanvasPanel into a shared animation module. Port the keyframes needed by the current interaction work: handle bob (4), edge drag flow, brush-connected, shockwave, pincer upper/lower. Codify the two timing primitives: state change (`0.15s cubic-bezier(.2,.8,.2,1)`) and physical response (`0.62s cubic-bezier(.19,1.42,.36,1)`). All animations gated on `[data-motion="full"]` using the existing motion-preference system.

## Acceptance criteria

- [ ] All existing canvas animations (edge drag flow, edge handle bob, shockwave, connection breathe, tag enter, ghost pulse) still work
- [ ] New keyframes (handle-bob-{top,right,bottom,left}, brush-connected, pincer-upper, pincer-lower) exist and render correctly in a `<style>` block
- [ ] The animation keyframes and timing tokens live in a single shared location, not inline in VisualCanvasPanel
- [ ] Setting `data-motion="reduced"` disables all animations from this shared location
- [ ] Existing inline visual canvas keyframes are removed from VisualCanvasPanel after migration

## Blocked by

- `001-node-side-handles.md`
- `002-drag-to-connect.md`
