# Panel split/join "feel"

Status: ready-for-agent
Owner: (unassigned)
Last updated: 2026-06-19

## The problem (user words)

> The UI for the split join panel system seems pretty good and it works, but I want to
> improve the feel. [...] overall UX is hard to explain why it feels off. The inspiration
> for the panel splitting was Blender.

This is a **feel / UX** effort, not a correctness or perf one. The panel system
(`src/ScreenRenderer.tsx` + `src/ScreenRenderer.css`) is a Blender-style tiling editor over a
vertex/edge/area graph owned by the Rust backend (`crates/core/src/graph.rs`).

## Organizing principle

One rule decides every item below:

> **Direct during the gesture, authoritative on release.**

While the user drags, the *client* owns the geometry and the panel moves immediately under the
cursor (no backend round-trip, no lag — Blender directness). On release, the backend gets one
call and is the source of truth again. The two CSS transitions shipped in the quick-wins pass
(the `screen-container--resizing` gate + the `.screen-area` settle) are the seam between those
two modes.

Corollary: **never animate what the user is dragging frame-by-frame; only animate what the
system moves on its own** (a panel appearing/disappearing, a snap settling, neighbors
reflowing). Don't stack "Blender-direct" and "transitions.dev-smooth" on the same motion.

## Verified code facts (don't re-derive)

| Fact | Evidence |
|---|---|
| Areas keyed by stable `area.id` → DOM node + terminal/WebGL **persist** across a resize; only % geometry changes | `ScreenRenderer.tsx:742` |
| Resize geometry is **pure & portable** to TS (no backend-only state) | `select_connected_vertices` flood-fill `graph.rs:188`; `resize_edge` clamp `graph.rs:965` |
| `resize_edge` = select connected vertices → clamp to `[cur−smaller, cur+bigger]∩[0,1]` using `free_space = dim − MIN_AREA_SIZE` → move all selected → `cleanup()` merges coincident | `graph.rs:965-1037` |
| `MIN_AREA_SIZE` = `0.05`, `EPSILON` = `1e-6` | `crates/core/src/domain/screen.rs:5-6` |
| `resize_edge`/`select_connected_vertices` read **only** `{vertices, edges, areas}` — no globals/RNG/counters; fully deterministic → client replica cannot diverge geometrically | verified `graph.rs` (RNG only in `area_split`, never called by resize) |
| `cleanup()` never repositions a vertex (only de-dupes coincident IDs) → safe to skip for preview; parity tests must compare coords/bounds, not vertex/edge lists | verified `graph.rs:329-337,283-327` |
| Geometry transition + drag-gating class already wired | `.screen-area` transition `ScreenRenderer.css:13-23`; `screen-container--resizing` applied `ScreenRenderer.tsx:673` |
| Current resize is preview-line-then-commit-on-release (NOT live) | sash `useEffect` `ScreenRenderer.tsx:201-294`; preview render `692-715` (CSS `218-230`) |

## Roadmap

| # | Item | Status | Backend change? | New dep? |
|---|------|--------|-----------------|----------|
| — | [Quick wins](00-quick-wins-shipped.md) — CSS transitions, snap feedback, affordances, listener-rebind fix, focus-ring z-index fix | **shipped (uncommitted)** | no | no |
| 1 | [Live resize](01-live-resize.md) — port the resize geometry to the client; panel tracks the cursor live; commit once on release | **implemented (uncommitted)** — tsc clean, 28/28 tests | no | no |
| 2 | [Split/join/close motion](02-split-join-close-motion.md) — FLIP so the appearing/disappearing panel grows-from-seam / collapses instead of popping | needs-decision | no | **open: hand-rolled WAAPI vs Framer Motion** |
| 3 | [Join as a direct drag](03-join-direct-drag.md) — replace double-click→mode→"click to keep" with drag-onto-neighbor + directional darken | ready-for-agent | no | no |

## Recommended sequencing

1. **#1 Live resize first.** Biggest "Blender feel" win, fully self-contained, no backend changes
   and no new deps. The keystone — it establishes the draft-screen/commit machine the others lean on.
2. **#2 Split/join/close motion** once the hand-rolled-vs-Framer decision is made (see that doc).
   Half of it is already free: survivors reflow via the `.screen-area` transition; only the
   appearing/disappearing node still pops.
3. **#3 Join-as-drag** — pure trigger + feedback change; the `join_areas` command/geometry is
   untouched, which is the surface the in-flight **`.scratch/trim-then-join`** work owns. No code
   conflict, but sequence it *around* trim-then-join to avoid reviewing the join path twice.

## Open decision (blocks #2 only)

**Hand-rolled WAAPI FLIP vs Framer Motion.** Lean: **hand-rolled** — no ~30–50 kb dep, full
control in a perf-sensitive Tauri app with live terminals/WebGL, and the surface is small because
CSS already animates the survivors. Framer (`layout` + `AnimatePresence`) is the faster-to-build
alternative. Pick one motion approach for the whole effort before starting #2.

## Investigation appendix

Three subagents (a motion-resource mine, a Blender-UX deep-dive, a code-level audit) produced the
findings behind this plan. The durable bits:

**Principles cheat-sheet**
1. Direct for cursor-driven motion, smooth for system-driven.
2. Keep animations < ~300 ms; ease-out for things arriving, ease-in for things leaving, standard for in-place resize.
3. Animate `transform`/`opacity`; treat `width/height/left/top` as the expensive exception you only pay for resize itself.
4. Springs carry velocity → good for drag-release settles; tune high damping so dividers settle without wobble.
5. Snap = physical feedback, not just color (overshoot/thicken/tick + magnetic stick with hysteresis to avoid doom-flicker).
6. Origin-aware motion: split grows from the seam; join collapses into the kept panel.
7. Don't animate high-frequency interactions; spend the budget on rare ones (split/join/close).
8. Always honor `prefers-reduced-motion`.

**Resources worth bookmarking**
- [transitions.dev](https://transitions.dev/) — named-technique recipe index (origin-aware open/close, scale+blur, spring pop-in).
- [Emil Kowalski — Great Animations](https://emilkowal.ski/ui/great-animations) / [animations.dev](https://animations.dev/learn) — the "<300 ms, ease-out, don't animate frequent actions" manifesto + springs.
- [Josh Comeau — CSS Transitions](https://www.joshwcomeau.com/animation/css-transitions/) + [Spring Physics](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/) — concrete numbers, the "doom flicker" hysteresis fix.
- [Rauno Freiberg — Invisible Details of Interaction Design](https://every.to/p/invisible-details-of-interaction-design) — most directly applicable: live delta application, snap-at-endpoints, trigger-during-gesture vs commit-at-end.
- [Material 3 motion tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs) — durable easing curves (standard `cubic-bezier(0.2,0,0,1)`; note the ubiquitous `0.4,0,0.2,1` is Material *2*).

**Blender grounding** (for #1 and #3): `source/blender/editors/screen/screen_ops.cc`
(`actionzone_modal`, `gesture_dir`/`SCREEN_DIR_*`, directional join arrow + darkened "this will be
consumed" victim) and `screen_edit.cc`. Note: Blender requires equal-length shared edges to join;
**trim-then-join already beats that — don't import the constraint.**
