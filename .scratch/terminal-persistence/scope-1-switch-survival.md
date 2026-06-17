# Scope 1 — Switch survival (in-app, lossless)

Status: ready-for-agent
Read first: [README.md](README.md)
Implemented by: [approach-a](approach-a-instance-pool.md) **or** [approach-b](approach-b-hide-dont-unmount.md)

This doc defines the **boundary** and the **acceptance tests** for the reported problem. It does
not restate the mechanism — that lives in the approach docs, deliberately, so the two don't drift.

## What "switch survival" means

While the app is running, a terminal keeps its full live state across:

- **Workspace switch** (and back)
- **Zoom / unzoom** of a panel
- **Session switch** (and back)

"Full live state" = the same xterm instance, the same shell process (same PID, CWD, running
command), and **scrollback with no holes** — including output the shell produced *while the
terminal was not visible*.

## What is explicitly out of scope here

- Surviving a **webview reload** or **full app restart** — that is
  [scope-2](scope-2-ring-buffer-restart.md). After a restart under Scope 1 alone, terminals start
  fresh (PTYs respawn, buffers empty); only the panel layout is restored, as today.

## Boundary decision to make (and document in the PR)

"In-app" needs one explicit edge: does survival span **sessions you have open** only, or all
sessions ever? The practical answer is: terminals survive across switches among the sessions/
workspaces currently kept open in memory; closing a session (explicit `close_session` /
`pty_kill`) ends its terminals. Approach B's naive form (render only the active session's
workspaces) still resets on session switch — if cross-session survival is required, see
approach-b step 2.

## Definition of done

1. All four [shared prerequisites](README.md#shared-prerequisites-do-these-regardless-of-a-vs-b)
   are implemented.
2. One approach (A or B) is implemented.
3. The acceptance test matrix below passes, **including the "gap" column** — that column is the
   one that proves the user's actual complaint is fixed and not just the cosmetic blank-reset.

## Acceptance test matrix

For each row: start a long-running, high-output command in a terminal, perform the action, and
check the result. Suggested commands: `npm install` in a real project, or
`for i in $(seq 1 100000); do echo "line $i"; done`, or `cat` a large file, or run `htop`/`vim`.

| # | Action | Pass criteria |
|---|--------|---------------|
| 1 | Workspace switch away and back **while output is streaming** | No blank reset. Scrollback intact. **The lines printed while away are present (no gap).** Shell still running. |
| 2 | Zoom a panel, then unzoom | Sibling terminals are unchanged — not reset, no gap. |
| 3 | Session switch away and back (within the open-session boundary) | Terminal restored with full buffer and live shell; no gap. |
| 4 | Resize the window after returning to a terminal | Terminal reflows correctly — no 1-column / stale-size bug; TUIs (vim/htop) redraw clean (PTY `resize` was pushed). |
| 5 | Rapid switching (mash workspace/session switch keys) | No flicker, no reset, no crash; feels instant. |
| 6 | Run a TUI (`vim`/`htop`), switch away and back | TUI still rendering correctly, cursor position intact. |
| 7 | Focus a terminal, switch away and back | Focus/keyboard input goes to the right terminal on return. |
| 8 | Close a panel (join) / close a workspace | Terminal **is** disposed and its PTY killed (verify no leaked process / growing memory). |

Row 8 guards against the opposite failure: "never dispose on switch" must not become "never
dispose at all."

## Manual verification harness

Per project `CLAUDE.md`, prefer the `/run` or `/verify` skill to launch the Tauri app and drive
these by hand. Memory leak check for row 8: watch the process list for orphaned shells and the
app's memory after opening/closing many terminals.
