# Handoff: PTY Doubling Bug on Split/Join

## Symptom

After repeated split/join operations, a terminal panel duplicates its output — every line typed or emitted appears twice (e.g., `ls` output printed twice). Console errors include:

- `TypeError: undefined is not an object (evaluating 'listeners[eventId].handlerId')` (x2)
- `[TAURI] Couldn't find callback id <number>. This might happen when the app is reloaded while Rust is running an asynchronous operation.`

## Root Cause: Async Event Listener Race

The bug is in `src/TerminalPanel.tsx`, specifically the `usePty` and `useTerminalDragDrop` hooks.

Tauri's `listen()` (from `@tauri-apps/api/event`) registers a callback handler **synchronously** in a global event map. The returned `Promise<UnlistenFn>` resolves to an `unlisten()` function that removes the handler — but the removal happens **asynchronously** (via `invoke()`, a microtask/Promise).

### Race Sequence During Join Operation

When a user joins two panels (e.g., Split(A, B) → Panel(A)):

1. React unmounts the old `SplitLayout` + child `TerminalPanel` components, then mounts a new `Panel` + new child `TerminalPanel`. Both old and new instances share the same `terminalId` → same `cacheKey` → same `CachedTerminal` entry in the module-scoped `terminalCache`.

2. **Old effect cleanup runs** (line ~210): calls `unsubOutput.then(fn => fn())`. The `then()` callback is queued as a microtask — the old Tauri listener is **not yet removed** from the global callback map.

3. **New effect setup runs synchronously** (line ~176): calls `listen("pty-output", ...)` which **synchronously inserts a new handler** into the global callback map.

4. **Both handlers are now live simultaneously.** The Rust backend emits `pty-output` globally via `app_handle.emit()` (`src-tauri/src/pty.rs:109`), dispatching to ALL registered listeners.

5. **Both handlers fire**, both find the same `terminalCache.get(cacheKey)` entry (same `c.ptyId`, same `c.terminal` instance since the xterm was reattached to new DOM at line 74), and both call `c.terminal.write(...)` — **output is written twice**.

The same race exists for:
- `pty-exit` listener (could cause phantom "Process exited" overlays)
- `useTerminalDragDrop` webview listener (could double-fire file drops)

## Fix Applied: Generation Counter Gating

Instead of trying to make unlisten synchronous (which Tauri's API doesn't support), each event listener is gated on a monotonically incrementing **generation counter** stored on the `CachedTerminal` object.

### Design Decision: Single increment site in `useXtermTerminal`

The generation counter must be incremented exactly **once per component mount**. If multiple effects increment it independently, they diverge — the last effect to increment sets the generation that `usePty`'s listeners can never match (they captured the previous value).

`useXtermTerminal` runs first in the component (it's declared before `usePty` and `useTerminalDragDrop`). On a remount it hits the `if (cached)` branch and increments generation. The other effects then read the already-bumped value without further incrementing. This guarantees all listeners in the same mount cycle agree on the generation number.

### Changes to `src/TerminalPanel.tsx`

**`CachedTerminal` interface** (line 12-18): Added `generation: number` field.

**`terminalCache.set` call** (line 115): Includes `generation: 0` in initial value.

**`useXtermTerminal` effect** (line 73): In the cached (remount) branch, increments generation ONCE:
```typescript
if (cached) {
  cached.disposeScheduled = false;
  cached.generation = (cached.generation || 0) + 1;  // ⬅ only increment site
  // ... reattach terminal to DOM ...
}
```

**`usePty` effect** (line 161): Reads generation WITHOUT incrementing:
```typescript
const gen = cached.generation;  // captures value set by useXtermTerminal
```
Each listener closure captures `gen` and gates all processing:
```typescript
const c = terminalCache.get(cacheKey);
if (!c || c.generation !== gen || !c.ptyId || ...) return;
```

**`useTerminalDragDrop` effect** (line 223): Same pattern — reads, doesn't increment.

### Why This Works

React runs passive effects (cleanup + new effects) in a single synchronous batch before yielding to the event loop. The sequence during a remount:

1. **useXtermTerminal** cleanup runs (removeChild, scheduleDispose). New effect runs → increments `cached.generation` to N+1.
2. **usePty** cleanup runs → old listener's `unsubOutput.then(fn => fn())` queues microtask. New effect runs → captures `gen = N+1`, registers new listeners gated on N+1.
3. **useTerminalDragDrop** cleanup runs → same async unlisten. New effect runs → captures `gen = N+1`, registers new listener gated on N+1.
4. React yields to event loop → microtasks run, old listeners finally removed.

During the gap (steps 1-3), if a `pty-output` event fires:
- **New listener**: checks `c.generation !== N+1` → false → processes event ✓
- **Old listener**: checks `c.generation !== N` (captured on previous mount) → true → **returns early** ✓

No output duplication. Both handlers eventually get cleaned up normally.

## Previous Fixes Already Applied

These are earlier fixes in the same file/session. Do NOT revert them:

### 1. `is_killed: AtomicBool` in `src-tauri/src/pty.rs`
- `PtyHandle` struct (line ~31) has `is_killed: AtomicBool`
- `pty_kill` (line ~260) sets `is_killed.store(true, Ordering::SeqCst)` before `child.kill()`
- `handle_pty_exit` (line ~88-100) checks `is_killed.load()` and suppresses `pty-exit` emission when true
- Prevents `[TAURI] Couldn't find callback id` warnings from the reader thread detecting EOF after an intentional kill

### 2. Deferred cache disposal in `TerminalCache.dispose()`
- `CachedTerminal.disposeScheduled: boolean` (line 16)
- `TerminalCache.dispose()` (line 30-41) uses `setTimeout(fn, 0)` with a cancel gate
- `useXtermTerminal` mount (line 71) cancels by setting `cached.disposeScheduled = false`
- Preserves xterm DOM element and scrollback across parent-type changes (Split↔Panel)

## Key Architecture Points

### Component Tree
```
App
└── SessionContainer (per session)
    └── SplitLayout (recursive tree of Split nodes + Panel leaves)
        └── Allotment (handles split resizing)
            └── TerminalPanel (each has a terminal_id UUID)
```

### TerminalPanel Identity
- Each `TerminalPanel` is keyed by `terminal_id: string` (UUID) in React (`SplitLayout.tsx:443`)
- `TerminalCache` is module-scoped (line 44), keyed by `terminalId` → survives component remounts
- `xterm.js` Terminal instances are cached across remounts; only the DOM attachment changes

### Event Flow (pty-output)
```
Rust: app_handle.emit("pty-output", payload)  [pty.rs:109]
  → Tauri IPC broadcasts to ALL registered listeners in webview
    → Frontend: c.terminal.write(Uint8Array(event.payload.data))  [TerminalPanel.tsx:182]
```

### Event Flow (pty-exit)
```
Rust: app_handle.emit("pty-exit", {terminal_id})  [pty.rs:106]
  → Tauri IPC broadcasts to ALL registered listeners
    → Frontend: sets isExited=true, shows "Process exited" overlay  [TerminalPanel.tsx:194-201]
```

## Remaining Known Issues to Watch For

1. **`handle_pty_exit` race with handle removal** (`pty.rs:88-100`): If the reader thread's EOF detection races with `pty_kill`'s `handles.remove(terminal_id)`, the handle is gone, `was_killed` is `false`, and `pty-exit` fires anyway. This is a secondary race that can cause a spurious "Process exited" overlay on join. The generation counter fix mitigates this by gating the listener, but the emission still happens — it just gets ignored by the stale listener. Fixing this would require keeping dead handles in the map with the `is_killed` flag rather than removing them.

2. **Asynchronous unlisten pattern persists**: The generation counter prevents double-processing, but old listeners remain in Tauri's global map until their microtask fires. For rapid split/join sequences, multiple stale listeners could accumulate briefly. This is cosmetic — they're harmlessly gated and eventally cleaned up.

## Test Commands

```bash
# Rust
cd src-tauri && cargo test  # 5 tests, all pass

# TypeScript
npx tsc --noEmit  # compiles clean
```

## Relevant Files

| File | Purpose |
|------|---------|
| `src/TerminalPanel.tsx` | TerminalPanel component, TerminalCache, usePty, useXtermTerminal, useTerminalDragDrop, useTerminalResize |
| `src/SplitLayout.tsx` | Recursive layout tree, split/join handlers, PanelComponent with terminal_id keys |
| `src/App.tsx` | App shell, useWorkspaceManager, handleWorkspaceTreeChange |
| `src/PanelContext.tsx` | React context providing terminalId, sessionId, workspaceId |
| `src/utils/migrateTree.ts` | Boot-time migration that injects UUIDs on old terminal nodes |
| `src-tauri/src/pty.rs` | PtyStore, PtyHandle, PtySpawnConfig, pty_spawn, pty_kill, handle_pty_exit, reader threads |
| `src-tauri/src/lib.rs` | Tauri commands: persist_workspace_tree, pty_spawn, pty_kill, pty_write, pty_resize |
| `crates/core/src/layout_store.rs` | LayoutNode enum (Split / Panel with terminal_id: Option<String>) |
