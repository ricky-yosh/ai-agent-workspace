# Terminal persistence across switches

Status: ready-for-agent
Owner: (unassigned)
Last updated: 2026-06-15

## The problem (user words)

> When I swap between sessions, terminal sessions don't persist. This can put a real
> damper on progress if users swap between workspaces and sessions quickly. It seems to
> completely reset the terminals and cause them to be reset.

This is a **feel / UX** problem, not an optimization problem. The fix target is: switching
between workspaces, sessions, and zoom states must feel instant and lossless, the way tab
switching does in VS Code / iTerm / Tabby.

## Diagnosis (verified against the code)

The **shell process never dies.** PTYs are owned by Rust state keyed by `terminal_id`
(`src-tauri/src/pty.rs:34-58, 193-194`), survive any frontend change, and `pty_spawn` is
idempotent — on return it reconnects to the *same* live shell (`pty.rs:230-232`). The reader
thread already coalesces output (16 ms / 64 KB, `pty.rs:122-158`), so raw IPC flooding is not
the issue.

The reset is entirely **frontend**: the xterm.js view is destroyed and rebuilt blank on every
switch. Three things combine:

1. **Deferred dispose actually disposes.** `terminalCache.dispose()` schedules
   `terminal.dispose()` on `setTimeout(…, 0)` and only cancels if the *same* `terminal_id`
   remounts in the same tick (`src/TerminalPanel.tsx:32-43, 119-126`). That only ever covered
   React StrictMode's double-invoke. On a real switch the timer fires and the buffer is
   destroyed; on return a fresh empty `new Terminal()` is built (`TerminalPanel.tsx:80-117`).

2. **The subtree gets unmounted by three different triggers:**
   - **Session switch** — `loading=true` renders `"Loading..."` instead of `SplitLayout`
     during an async refetch, unmounting every terminal (`src/App.tsx:70-92, 317-323`).
   - **Workspace switch** — only the active workspace's tree is rendered, so the old tree's
     panels unmount (`App.tsx:354-368`; panels keyed by `terminal_id`, `SplitLayout.tsx:444`).
   - **Zoom** — `SplitLayout` returns *only* the zoomed node, unmounting every sibling
     terminal (`SplitLayout.tsx:476-478`).

3. **Output produced while detached is lost** — the `pty-output` listener is torn down on
   unmount (`TerminalPanel.tsx:211-214`) and guards on `element.isConnected` (`:184`), and
   there is no backend buffer. So even if we keep the instance alive, anything the shell prints
   while you are on another workspace leaves a **hole** in the scrollback.

### The discriminator: "instance alive" ≠ "lossless switch"

Walk the real scenario: `npm install` running on workspace A → switch to B → switch back.
Merely "stop disposing / keep the instance in the pool" gives you the scrollback up to the
moment you left, plus everything after you return — but the lines printed *while you were away*
are gone. **Fixing the user's actual complaint requires keeping a live subscription writing into
the detached buffer**, not just keeping the instance. This is mandatory frontend work (Scope 1),
not something to defer to the backend ring buffer.

## The linchpin fix (shared by both approaches)

Replace the per-mount `listen("pty-output")` with **one app-level listener that dispatches by
`pty_id` into the terminal pool and writes regardless of mount state.** This single change:

- closes the scrollback gap (output is written even while detached — xterm supports writing to
  a terminal whose element is detached from the DOM, see xterm.js issue #266);
- lets you remove the `isConnected` guard (`TerminalPanel.tsx:184`);
- lets you delete the `generation` counter — its only job was guarding stale per-mount closures,
  which a single global listener doesn't have.

Note the pool is keyed by `terminal_id` but `pty-output` events carry `pty_id`. The global
listener needs a reverse index `pty_id → pool entry`; pool entries already hold `ptyId`, so
build the map from that.

## Shared prerequisites (do these regardless of A vs B)

Both approaches fail without these. Each approach doc assumes they are done.

1. **Disposal lifecycle.** Tie `terminal.dispose()` to *explicit close only* — the same path
   as `pty_kill` (panel join, `SplitLayout.tsx:286`, and workspace close). Never on React
   unmount. Delete the `setTimeout(0)` dispose. (Otherwise "never dispose on switch" becomes a
   memory + process leak.)
2. **Loading-gate unmount** (`App.tsx:317-323`). Session switch must stop rendering `"Loading…"`
   in place of `SplitLayout`. Keep the layout mounted; show any spinner as an overlay, or only
   gate the very first load when there is nothing to show yet.
3. **Zoom unmount** (`SplitLayout.tsx:476-478`). Zoom must keep siblings mounted (e.g. render
   the full tree and visually promote the zoomed node) rather than returning only the zoomed
   node.
4. **Global output subscription** — the linchpin fix above.

## The two axes (and why they are not orthogonal)

Two independent decisions, but **Scope 1 is *implemented by* the approach** — they overlap on
purpose, so the docs are split to each own exactly one thing and avoid drift:

| | Scope 1: survive switches (in-app) | Scope 2: + survive restart |
|---|---|---|
| **Approach A: instance pool** | [approach-a-instance-pool.md](approach-a-instance-pool.md) + [scope-1](scope-1-switch-survival.md) | A + [scope-2](scope-2-ring-buffer-restart.md) |
| **Approach B: hide-don't-unmount** | [approach-b-hide-dont-unmount.md](approach-b-hide-dont-unmount.md) + [scope-1](scope-1-switch-survival.md) | B + [scope-2](scope-2-ring-buffer-restart.md) |

- **[approach-a-instance-pool.md](approach-a-instance-pool.md)** — keep xterm instances in a
  pool outside React, reparent the detached DOM node on switch. VS Code's model. Renderer stays
  idle for hidden terminals; lighter; the smaller change to `MainArea`.
- **[approach-b-hide-dont-unmount.md](approach-b-hide-dont-unmount.md)** — render every terminal
  always and toggle CSS visibility. Simplest per-terminal code, but materializes every terminal
  in the live DOM and forces rendering *all workspaces* and *all panels during zoom* — a more
  invasive change to `MainArea`/`SplitLayout` than it first sounds.
- **[scope-1-switch-survival.md](scope-1-switch-survival.md)** — the boundary + acceptance tests
  for "lossless across switch/zoom/session while the app runs." Thin; points at the approach
  docs, does not restate them.
- **[scope-2-ring-buffer-restart.md](scope-2-ring-buffer-restart.md)** — backend ring-buffer
  addendum that layers on *either* approach. Carefully distinguishes webview reload (true resume)
  from full app restart (static-text scrollback only).

## Recommended path

1. Do the **shared prerequisites** + **Approach A** + **Scope 1**. That fixes the reported
   problem end to end.
2. Evaluate feel against the [test matrix](scope-1-switch-survival.md#acceptance-test-matrix).
3. If you want to compare, try **Approach B** in a separate worktree (each approach doc is
   self-contained for this).
4. Add **Scope 2** later if terminal scrollback surviving app restart is wanted — it's additive.

## How to "try both"

Each approach doc is written to be handed to a **fresh git worktree** independently
(`isolation: worktree` if delegating to an agent). They share the prerequisites and the linchpin
fix but diverge on the mount strategy. Don't mix them in one branch.
