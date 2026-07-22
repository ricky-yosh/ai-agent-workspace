# 03 — Issue Detail Modal: read mode with edit toggle

**What to build:** The existing-issue modal becomes an Issue Detail Modal following the app's Read/Edit Modal pattern. It opens in a read mode showing the complete issue and toggles into the existing action-list as edit mode. Panel triggers move to match: `Enter`/right-click open read mode, the list-level `e` shortcut disappears, and inline click-to-expand stays as the lightweight peek. The create-issue flow is untouched.

**Blocked by:** 01 — Extract shared issue-body markdown renderer.

**Status:** ready-for-agent

- [ ] `Enter` on a focused issue row opens the Issue Detail Modal in read mode; right-click does the same
- [ ] Read mode shows the issue's number, open/closed state, label, author, created/updated timestamps, and full body rendered via the shared markdown renderer, composed from Component Library Primitives (Badge, Button, Text/Heading)
- [ ] `e` or the header Edit button switches from read mode to edit mode; edit mode is the existing action-list with per-field sub-pages, unchanged
- [ ] Header Done button or `Cmd+Enter` saves changes and returns to read mode
- [ ] `Esc` pops exactly one level: field sub-page → edit-mode action list → read mode → closed
- [ ] Leaving edit mode via `Esc` discards unsaved changes
- [ ] The list-level `e` shortcut is removed; click-to-expand inline and the `c` create shortcut behave as before
- [ ] Create flow opens directly in the action-list (no read mode) and is otherwise unchanged
- [ ] Component tests at the mocked Tauri invoke boundary (prior art: existing Issue Tracker panel tests): modal opens in read mode and renders the issue's content; `e` and header button toggle to edit mode; `Esc` pops one level at a time and discards unsaved edits when leaving edit mode; Done/`Cmd+Enter` saves and returns to read mode; `Enter` and right-click from the list open read mode; list-level `e` no longer opens the editor

**Implementation note (from code review of ticket 01):** the shared `IssueBody` renderer's markdown styles (`issue-md-code--block`, `issue-md-code--inline`) currently live in the Issue Tracker panel's stylesheet, scoped under `.issue-body__content`. When the read mode composes `IssueBody`, make those styles usable outside the panel (e.g. co-locate them with the shared component) so the modal renders markdown identically.
