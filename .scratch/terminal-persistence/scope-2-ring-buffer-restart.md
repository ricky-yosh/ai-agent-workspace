# Scope 2 — Backend ring buffer (restart survival)

Status: ready-for-agent
Read first: [README.md](README.md), then [scope-1](scope-1-switch-survival.md)
Layers on: [approach-a](approach-a-instance-pool.md) **or** [approach-b](approach-b-hide-dont-unmount.md)

Additive backend work that lets terminal **content** survive beyond a single live frontend tree.
This is optional and independent of which frontend approach you pick. **Do not start this until
Scope 1 is working** — without the live subscription from Scope 1, a ring buffer just papers over
the gap instead of fixing it.

## Two restart cases — do not conflate them

The research and naive framing blur these. They have very different guarantees:

### Case 1 — Webview / frontend reload (Rust process survives)

The PTYs are **still alive** (they live in `PtyStore`, `pty.rs:34-58`, owned by the Rust process,
not the webview). On reload the frontend reconnects via the idempotent `pty_spawn`
(`pty.rs:230-232`) and replays an **in-memory** ring buffer. This is a **true resume**: running
commands continue, the shell is the same process. Cheap and high-value.

### Case 2 — Full app quit / relaunch (Rust process dies)

The Rust process dies, so **the PTYs die with it.** You cannot resume a running command — the
shell is gone. The best achievable is to have persisted the buffer to disk (SQLite) and replay it
as **static text scrollback** into a freshly spawned shell. This is exactly VS Code's limitation
(`terminal.integrated.enablePersistentSessions` restores scrollback text, not running processes).

**Do not let any copy imply a long build resumes after a full restart — it cannot without a
separate long-running daemon process, which is out of scope.**

## Why a ring buffer at all

`portable_pty` is pull-based: the reader thread (`run_pty_reader`, `pty.rs:115-158`) currently
*emits* output and keeps no history. So:

- After a webview reload, a reconnecting frontend has missed everything since spawn.
- There is nothing to persist for Case 2.

A capped per-PTY byte ring buffer fixes both, and also hardens Scope 1 against any brief window
where no listener is attached.

## Design

### In-memory ring buffer (Case 1)

In `PtyHandle` (`pty.rs:23-32`), add a capped buffer of raw bytes:

```rust
struct PtyHandle {
    // …existing…
    scrollback: Arc<Mutex<RingBuffer>>, // capped, e.g. 1 MB or N lines of bytes
}
```

- In `run_pty_reader` (`pty.rs:144-149`), after coalescing, append the bytes to `scrollback`
  (cap by evicting from the front) **before/alongside** `emit_pty_output`.
- Add a command `pty_get_scrollback(terminal_id) -> Vec<u8>` (or fold into `pty_spawn`'s result)
  that returns the current buffer.
- Frontend reconnect flow: on attach, call `pty_get_scrollback`, `terminal.write()` it **once**
  to repaint, *then* rely on the Scope 1 global live listener for new output. Guard against
  double-writing the overlap (e.g. fetch scrollback and subscribe atomically, or include a
  sequence offset).
- Cap is a memory/fidelity tradeoff — mirror VS Code's `persistentSessionScrollback` idea
  (default ~1 MB or a few thousand lines). Make it a constant near `PTY_READ_BUFFER_SIZE`.

### On-disk persistence (Case 2) — optional second layer

Only if scrollback should survive a full relaunch:

- Persist each terminal's ring buffer to SQLite (the app already uses SQLite) keyed by
  `terminal_id`, throttled (e.g. on a timer and on graceful shutdown), capped.
- On startup, when a layout tree restores a terminal panel, spawn a fresh PTY (as today) **and**
  replay the persisted scrollback as static text into the new xterm before the new shell's first
  output. Make it visually clear (or accept) that this is history, not a live session — the
  prompt below it is a brand-new shell.
- Bound total disk use; prune buffers for terminals no longer referenced by any layout tree.

## Do NOT do this

- **Do not run `@xterm/headless` in the Rust backend.** That is VS Code's technique and only
  works because its pty host is a Node process. Your backend is Rust — hold a **raw-byte ring
  buffer**, not a headless terminal emulator.
- **Do not** make Scope 2 a prerequisite for fixing switches. Scope 1 already makes switches
  lossless in-app; Scope 2 is purely about reload/restart.

## Files touched

- `src-tauri/src/pty.rs` — ring buffer on `PtyHandle`; append in `run_pty_reader`; new
  `pty_get_scrollback` command (Case 1).
- `src-tauri/src/lib.rs` — register the new command; wire shutdown persistence (Case 2).
- Persistence layer (`crates/core/...`) — a scrollback table/repository (Case 2 only).
- Frontend pool/attach (from the chosen approach) — fetch + replay scrollback on attach, with
  overlap guard.

## Acceptance

In addition to the [Scope 1 matrix](scope-1-switch-survival.md#acceptance-test-matrix):

| # | Action | Pass criteria |
|---|--------|---------------|
| R1 | Trigger a webview reload while output is streaming (Case 1) | Terminal repaints full recent scrollback; the **same** shell continues; running command still running. |
| R2 | Quit and relaunch the app (Case 2, if implemented) | Panel layout restored; recent scrollback shown as static text; a **new** shell prompt is live below it. No claim/appearance that the old process resumed. |
| R3 | Very large output then reload | Repaint is bounded by the cap (no unbounded memory / multi-second freeze); only the capped tail is shown. |
| R4 | Reload mid-stream | No duplicated overlap region and no missing region between replay and live output. |
