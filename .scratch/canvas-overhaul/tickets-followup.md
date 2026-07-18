# Tickets: Canvas overhaul follow-ups

Status: ready-for-agent

Gaps found in code review of the canvas overhaul (see `.scratch/canvas-overhaul/spec.md`, ADR 0018). All four tickets are independent — work in any order.

Work the **frontier**: any ticket whose blockers are all done.

## Fix CDC echo suppression in canvas sync

**What to build:** Dragging a node stays smooth even while CDC events arrive. When the panel's own write echoes back as a CDC event, the sync layer recognises it via the pending set and skips the re-fetch; genuine remote changes (another window, MCP agent) still trigger a re-fetch and update the canvas.

**Blocked by:** None — can start immediately.

- [ ] CDC node-change events consult the pending set before re-fetching; a node mid-drag or mid-persist never snaps back to a stale position
- [ ] Remote node/edge changes (originating outside this panel) still appear without a canvas switch
- [ ] Pending entries are always cleaned up, including when the persist call fails

## Fetch node sources per-canvas correctly

**What to build:** Source counts and source lists actually render on node chrome. The sync layer's placeholder sentinel-argument fetch is replaced with a real per-canvas listing so every node's sources load in one round trip when a canvas opens.

**Blocked by:** None — can start immediately.

- [ ] A backend command lists all node sources for a canvas in one call
- [ ] Node chrome shows the correct source count immediately after opening a canvas
- [ ] Adding or removing a source in the node modal updates the count on the node without a canvas switch
- [ ] The sentinel-argument workaround is deleted

## Gate handle bob animation on connectable state

**What to build:** Connection handles only bob when they're actually inviting a connection — on node hover or during an active connection drag — instead of animating constantly on every node. Reduced-motion setting continues to disable the bob entirely.

**Blocked by:** None — can start immediately.

- [ ] Handles are still while the canvas is idle
- [ ] Bob starts on node hover and during an eligible connection drag
- [ ] `data-motion` reduced setting still suppresses the animation
- [ ] Already-connected handles respect the existing connected-state attribute

## Migrate CanvasModal to ActionModal pattern

**What to build:** Canvas create/rename flows use the shared `ActionModal` UI component, matching the pattern already used by other panels. The bespoke canvas modal component and its stylesheet are deleted.

**Blocked by:** None — can start immediately.

- [ ] Creating and renaming a canvas goes through the shared `ActionModal` with the same keyboard behaviour as other panels' modals
- [ ] Bespoke canvas modal component and CSS are deleted with no remaining imports
- [ ] Existing canvas delete confirmation still works
