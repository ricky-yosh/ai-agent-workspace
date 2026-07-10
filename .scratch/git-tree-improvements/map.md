# Git Tree Panel Improvements — Wayfinder Map

## Tracer bullets

| # | Issue | Status | Blocks |
|---|-------|--------|--------|
| 001 | Rendering bugs (lane termination, vertical line, search topology, connector path) | `ready-for-agent` | — |
| 002 | Lane recycling and octopus merge fix | `ready-for-agent` | — |
| 003 | Branch colors by branch identity | `ready-for-agent` | 002 |
| 004 | Ref labels (HEAD indicator, tag prefix, overflow) | `ready-for-agent` | — |
| 005 | Commit Detail Pane file tree (Zed-style) | `ready-for-agent` | — |
| 006 | Commit Quick-Open modal (Cmd+Shift+O) | `ready-for-agent` | — |
| 007 | Contiguous selection and range diff dispatch | `ready-for-agent` | — |

## Execution order

Issues 001, 002, 004, 005, 006 can all start in parallel. Issue 003 depends on 002 (lane recycling must exist before per-branch colors make sense). Issue 007 depends on the GitTreePanel interaction layer being stable (001 should be done first to avoid conflicts on the same file).

## Relies on

- `src/panels/GitTreePanel.tsx` — main panel (all issues touch this)
- `src/panels/git/laneAssignment.ts` — lane algorithm (issues 001, 002, 003)
- `src/panels/git/branchColors.ts` — color assignment (issue 003)
- `crates/git-operations/src/lib.rs` — Rust backend (issues 001, 005, 007)
- `src/providers/ViewerRegistryProvider.tsx` — diff dispatch (issue 005, 007)
