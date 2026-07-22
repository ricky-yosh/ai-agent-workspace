## Agent skills

### Issue tracker

Issues and PRDs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default role names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) used as `Status:` fields in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `.aw/CONTEXT.md` and `.aw/adr/` (note non-standard `.aw/` location). See `docs/agents/domain.md`.

## Coding standards

- **Self-documenting code over justifying comments.** If a workaround needs a paragraph-long comment to justify why it's OK, the code is wrong — fix the code. Express intent through naming, types, and structure; delete dead/defensive code rather than annotating it. Keep only comments the code *cannot* express: *why* not *what* — links to an ADR/issue, non-local consequences, or genuinely non-obvious domain facts.

## ADR format

ADRs live in `.aw/adr/` as `NNNN-kebab-title.md` with a unique, monotonic number. Each records one architectural decision in four sections — **Status / Context / Decision / Consequences** — capturing the problem, the choice, and the *why*, not implementation detail that duplicates the code (no command/IPC signature tables, code blocks beyond 2–3 illustrative lines, file/crate-tree listings, or ASCII diagrams — those go stale). Very short ADRs (under ~15 lines) may stay as terse prose with a bold `Status:` line instead of the full skeleton. Mark superseded/amended decisions in `Status:` and link the superseding ADR.
