# Approach A — Instance pool + reparent the detached DOM node

Status: ready-for-agent
Read first: [README.md](README.md) (diagnosis, shared prerequisites, the linchpin fix)

This is VS Code's model and the recommended approach. xterm instances live in a pool **outside
React's render tree**; the React component that "shows" a terminal is a thin shell that, on
mount, moves the existing terminal's wrapper DOM node into its container and, on unmount, does
**nothing destructive**. The instance, its buffer, and its output subscription all survive.

## Why this approach

- The renderer is idle for hidden terminals (detached DOM nodes don't paint), so memory/CPU
  scale gracefully with many terminals.
- It is the smallest change to `MainArea` — you still render only the active workspace's tree;
  the persistence lives in the pool, not in the React tree shape.
- It is the proven pattern (VS Code `terminalInstance.ts` `attachToElement` / `detachFromElement`).

## Current state to build on

Most of the scaffolding already exists in `src/TerminalPanel.tsx`:

- `TerminalCache` (module-level, keyed by `terminal_id`) — `:21-46`. Keep it, harden it.
- On remount it already reparents `terminal.element` into the new container — `:72-79`.
- On unmount it detaches the node — `:122-124` — but then calls the broken deferred dispose
  (`:125`). That dispose is what we remove.

So Approach A is mostly: **stop destroying, centralize the subscription, and fix the
attach/resize edges.**

## Implementation steps

### 1. Shared prerequisites (from README)

Do all four before the steps below: remove `setTimeout(0)` dispose, fix the loading-gate
unmount (`App.tsx:317-323`), fix the zoom unmount (`SplitLayout.tsx:476-478`), and install the
global `pty-output` listener (the linchpin).

### 2. Promote the pool to a real, explicit module

Lift `TerminalCache` into its own module (e.g. `src/terminal/terminalPool.ts`) so its lifecycle
is decoupled from the `TerminalPanel` component file. The entry shape stays close to today's
`CachedTerminal` but loses `disposeScheduled` and `generation`:

```ts
interface PooledTerminal {
  terminalId: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  wrapperEl: HTMLDivElement; // persistent wrapper that contains terminal.element
  ptyId: string | null;
}
```

Use a **persistent wrapper element** (`wrapperEl`) that you `term.open(wrapperEl)` exactly once,
and reparent the *wrapper* on attach — not `terminal.element` directly. This matches VS Code and
avoids the duplicate-canvas bug (see step 5).

Pool API:

- `acquire(terminalId): PooledTerminal` — return existing or create (creates terminal, fitAddon,
  wrapper, calls `term.open(wrapper)` once, wires `term.onData → pty_write`).
- `attach(terminalId, container)` — `container.appendChild(entry.wrapperEl)`, then fit-on-visible
  (step 5).
- `detach(terminalId)` — remove `wrapperEl` from its parent. **No dispose.**
- `dispose(terminalId)` — `term.dispose()`, delete entry. Called **only** from the explicit
  close paths (panel join `SplitLayout.tsx:286`; workspace close).

### 3. Centralize the output subscription (the linchpin)

In one app-level module (mount once near `App`), keep a single listener:

```ts
listen<{ pty_id: string; data: number[] }>("pty-output", (e) => {
  const entry = pool.byPtyId(e.payload.pty_id); // reverse index built from entry.ptyId
  entry?.terminal.write(new Uint8Array(e.payload.data));
});
```

- Build `byPtyId` from the pool entries (update it whenever `ptyId` is set after spawn).
- Writes happen regardless of whether the panel is mounted or the element is connected — this is
  what closes the scrollback gap. xterm buffers writes to a detached terminal (xterm.js #266).
- Do the same for `pty-exit` (one app-level listener keyed by `terminal_id`), updating the pool
  entry's `ptyId = null` and surfacing exit state via the pool (see step 6).

Remove the per-mount `listen` calls and the `generation` / `isConnected` guards entirely.

### 4. Make `TerminalPanel` a thin shell

`TerminalPanel` becomes: on mount `pool.acquire(terminalId)` + `pool.attach(terminalId, container)`
+ ensure a PTY (`pty_spawn`, idempotent); on unmount `pool.detach(terminalId)` only.

- Keep PTY spawn idempotent (`pty.rs:230-232` already handles this) — on remount it returns the
  existing `pty_id`; assign it to the pool entry and update `byPtyId`.
- Drag/drop (`useTerminalDragDrop`) and the exit/restart UI stay, but read state from the pool
  entry rather than per-mount closures.

### 5. Fix the attach/resize edges (the 1-column bug)

When reattaching a previously-detached terminal:

- Do **not** call `term.open()` again on an ordinary attach — the wrapper already holds the
  rendered terminal. Re-call `open()` only if the owning **document/window** changes (not a
  concern unless you add detached windows). Verify against VS Code's `attachToElement` guard.
- `fitAddon.fit()` reads computed container size, which is `0`/`auto` while hidden. So: attach →
  wait until visible & laid out (double `requestAnimationFrame`, and/or the existing
  `ResizeObserver` in `useTerminalResize`) → guard with `fitAddon.proposeDimensions()` (skip if
  undefined/zero) → `fit()`.
- **Close the loop to the PTY:** after fit, if `cols/rows` changed, `invoke("pty_resize", …)`
  (already done in `useTerminalResize` `:262-270`; keep it). Otherwise TUIs (vim/htop) draw at
  stale dimensions.

### 6. Exit / restart state

Today `isExited`/`isSpawning` are per-mount React state. Move the source of truth onto the pool
entry (e.g. `status: "spawning" | "live" | "exited"`) updated by the app-level `pty-exit`
listener, and have `TerminalPanel` subscribe (a small `useSyncExternalStore` over the pool, or a
re-render bump). This keeps exit state correct even if the panel was unmounted when the process
exited.

## Files touched

- `src/TerminalPanel.tsx` — slim down to a shell; remove dispose timer, per-mount listeners,
  generation/isConnected guards.
- `src/terminal/terminalPool.ts` (new) — the pool + reverse index + global listeners.
- `src/App.tsx` — mount the global listeners once; fix the loading-gate (`:317-323`).
- `src/SplitLayout.tsx` — fix zoom to keep siblings mounted (`:476-478`); dispose pool entry on
  join (`:286`).

## Risks / gotchas

- **Duplicate canvas** if `open()` is re-called on attach. Open once into the persistent wrapper.
- **Memory leak** if `dispose` is never called on true close. Audit every panel-removal path
  (join, workspace close, session close if it kills PTYs) calls `pool.dispose`.
- **Reverse index drift** — `byPtyId` must be updated on every spawn/respawn and cleared on
  dispose, or output routes to the wrong/old terminal.
- **Focus** — after attach, restore focus to the previously focused terminal so keyboard input
  isn't lost on switch.

## Acceptance

Use the [Scope 1 test matrix](scope-1-switch-survival.md#acceptance-test-matrix). Pass = no blank
reset on switch/zoom/session, **scrollback intact including the gap** (output produced while
away), no 1-column resize bug, focus preserved.
