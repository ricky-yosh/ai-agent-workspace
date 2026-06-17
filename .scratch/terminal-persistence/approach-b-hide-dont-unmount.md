# Approach B — Hide, don't unmount

Status: ready-for-agent
Read first: [README.md](README.md) (diagnosis, shared prerequisites, the linchpin fix)

Render every terminal's container in the DOM **always**, and switch views with CSS
(`display:none` / `visibility:hidden`) instead of conditional rendering. React never unmounts the
terminal subtrees, so xterm instances and their buffers are never destroyed.

This is the simplest *per-terminal* code (no manual DOM reparenting, no pool), but it pushes
complexity up into `MainArea`/`SplitLayout`, because to never unmount you must render **all
workspaces** at once and keep **all panels** mounted during zoom. Choose this only if the number
of terminals per session is modest.

## Why this approach (and its cost)

- **Pro:** no instance pool, no DOM reparenting, no attach/detach choreography. The xterm
  instance stays exactly where React put it.
- **Con:** every terminal across every workspace is materialized in the live DOM simultaneously.
  Hidden terminals still hold canvas/WebGL contexts and DOM nodes. For a handful of terminals
  this is fine; for dozens it is heavier than Approach A.
- **Con:** the change to `MainArea`/`SplitLayout` is bigger than it sounds (see steps 2–3).

## Implementation steps

### 1. Shared prerequisites (from README)

Do all four. Note that for Approach B, prerequisites #2 (loading-gate) and #3 (zoom) are not just
bug fixes — they are *structural*: the whole approach depends on never unmounting, so the
loading-gate and zoom must use visibility, not conditional rendering. The linchpin global
`pty-output` listener is still required: even hidden-but-mounted terminals benefit from a single
listener, and it removes the `isConnected` guard that would otherwise drop output for hidden
terminals (a hidden element can still be `isConnected`, but centralizing avoids per-mount
fragility and lets you delete the `generation` counter).

### 2. Render all workspaces, toggle visibility

In `MainArea` (`src/App.tsx:354-368`), instead of rendering only `activeWorkspace`'s
`SplitLayout`, render a `SplitLayout` for **every** workspace and hide the inactive ones:

```tsx
{workspaces.map((ws) => (
  <div
    key={ws.id}
    style={{ display: ws.id === activeWorkspace?.id ? "block" : "none",
             width: "100%", height: "100%" }}
  >
    <SplitLayout workspaceId={ws.id} sessionId={activeSessionId}
                 tree={ws.current_tree} /* … */ />
  </div>
))}
```

- This means `useWorkspaceManager` must hold the trees for **all** workspaces (it already loads
  `workspaces` via `get_session_workspaces`, `App.tsx:74`), and apply tree edits to the right
  workspace by id (the optimistic update in `handleWorkspaceTreeChange` `:104-109` already does).
- **Session switch caveat:** switching session swaps the whole `workspaces` array, so terminals
  from session X still unmount when you leave session X. If cross-*session* survival is also
  wanted, you must render workspaces for all *open* sessions too — a much larger DOM. Decide the
  boundary explicitly (see scope-1: in-app survival usually means within the session set you keep
  open). Document the chosen boundary in the PR.

### 3. Zoom via visibility, not conditional render

`SplitLayout` currently returns *only* the zoomed node (`:476-478`), unmounting siblings. Change
zoom to render the full tree and visually promote the zoomed panel (absolute-position it over the
others, or `display:none` the siblings' wrappers) so no terminal unmounts.

### 4. Disposal lifecycle

Even though nothing unmounts on switch, terminals still need a real teardown on **explicit close**
(panel join `SplitLayout.tsx:286`, workspace/session close). Wire those paths to
`terminal.dispose()` + `pty_kill`. Without this, closed terminals leak because the generic
"dispose on unmount" path is gone.

### 5. Fit-on-show (the 1-column bug, sharper here)

This is the main xterm gotcha for Approach B. A terminal sized while `display:none` computes to
0 columns, and `FitAddon.fit()` either no-ops or throws. So:

- **Never** `fit()` while hidden.
- When a workspace/panel becomes visible, fit **after** it is laid out: flip visibility →
  double `requestAnimationFrame` → `proposeDimensions()` guard → `fit()` → push `pty_resize` if
  `cols/rows` changed.
- Keep a `ResizeObserver` per container; it won't fire while `display:none`, so you must also fit
  explicitly on the hide→show transition (an observer alone is not enough).
- Consider `visibility:hidden` + offscreen instead of `display:none` if you want hidden
  terminals to retain measurable layout (avoids some fit churn at the cost of layout work).

## Files touched

- `src/App.tsx` — render all workspaces with visibility toggling; fix loading-gate; mount the
  global `pty-output`/`pty-exit` listeners.
- `src/SplitLayout.tsx` — zoom via visibility (`:476-478`); dispose + kill on join (`:286`).
- `src/TerminalPanel.tsx` — remove the dispose timer and per-mount listeners; add the
  fit-on-show handling; read exit state from the global listener.

## Risks / gotchas

- **Resource use** scales with total terminals, not visible ones. Watch memory with many
  terminals/workspaces; if it bites, switch to Approach A.
- **Fit-on-show is easy to get subtly wrong** — the 1-column / stale-size bug shows up whenever a
  terminal is first revealed. Centralize the "reveal a terminal" routine so every show path uses
  the same fit sequence.
- **Session boundary** (step 2) — be explicit about whether survival spans sessions; the naive
  version still resets on session switch.
- **Input routing / focus** — with many mounted terminals, ensure only the visible focused
  terminal receives keystrokes.

## Acceptance

Use the [Scope 1 test matrix](scope-1-switch-survival.md#acceptance-test-matrix). Pass = no blank
reset on switch/zoom (and session, within the declared boundary), **scrollback intact including
the gap**, no 1-column resize bug, focus preserved.
