Status: ready-for-agent

# PRD: Issue Detail Modal

## Problem Statement

The Issue Tracker panel shows a session's Issues as a compact list, but its modal experience is lopsided. Creating an issue uses a well-liked action-list modal, yet opening an *existing* issue drops the user straight into that same editing action-list — there is no place to simply *read* an issue in full focus. The only full-content view is the inline row expansion, which is squeezed into the width of the list and competes with the list itself. Meanwhile the rest of the app has converged on a **Read/Edit Modal** pattern (Node Edit Modal on the Visual Canvas, New Workspace Modal): a dialog that opens in a read view of the entity and toggles into an edit mode via an Edit/Done header button. The Issue Tracker is the odd one out, and issue `state` (open/closed) remains the one field with no user-facing affordance at all — only the AI can change it.

## Solution

Introduce an **Issue Detail Modal** for existing issues: a Read/Edit Modal that opens in a **read mode** showing the complete issue — number, state, label, rendered markdown body, author, and timestamps — and toggles into the existing, familiar action-list **edit mode** via the header Edit button or the `e` key. The create-issue flow is untouched. In the list, `Enter` or right-click on a row opens the modal in read mode, while clicking a row keeps the lightweight inline expansion for quick peeks. Edit mode gains a staged **State** action row so the user can close or reopen an issue, committed together with title, body, and label on Save. Alongside the UI work, the label vocabulary becomes **closed**: the five triage labels are enforced at the command layer, closing an oversight that let MCP write arbitrary label strings.

## User Stories

1. As a user, I want to press `Enter` on a focused issue row to open a modal showing the whole issue, so that I can read it in full focus without the list crowding it.
2. As a user, I want the detail modal to open in a read-only view, so that I can absorb the content without being dropped into an editing UI.
3. As a user, I want the read view to render the issue body as markdown, so that checklists, code blocks, and links are readable.
4. As a user, I want the read view to show the issue's number, open/closed state, label, author, and created/updated timestamps, so that I have full context in one place.
5. As a user, I want to right-click an issue row to open the detail modal, so that I have a pointer-driven path to the same view.
6. As a user, I want clicking a row to keep expanding the body inline, so that quick peeks at an issue stay lightweight.
7. As a user, I want to press `e` (or click an Edit button in the header) while reading, so that I can switch the modal into edit mode.
8. As a user, I want edit mode to use the same action-list and sub-pages I already know from creating issues, so that I don't have to learn a second editing idiom.
9. As a user, I want to edit the issue's title, body, and triage label from edit mode, so that I can correct and refine issues myself.
10. As a user, I want to stage an open/closed state change in edit mode, so that I can close or reopen an issue without asking the AI.
11. As a user, I want my title, body, label, and state changes committed together when I save, so that the issue updates atomically.
12. As a user, I want to delete an issue from edit mode with a confirm step, so that destructive actions stay deliberate (existing behavior, preserved).
13. As a user, I want `Esc` to back out one level at a time — field sub-page, then edit mode, then read mode, then closed — so that a single stray keypress never dumps me out of the modal.
14. As a user, I want leaving edit mode via `Esc` to discard my unsaved changes, so that I always have a clear escape hatch.
15. As a user, I want the header Done button (or `Cmd+Enter`) to save my changes and return me to read mode, so that I can immediately review what I saved.
16. As a user, I want the list-level `e` shortcut removed, so that every edit flows through the read view first and the app stays consistent.
17. As a user, I want the create-issue modal to stay exactly as it is, so that the flow I like is not disturbed.
18. As a user, I want the panel to keep refreshing live when the AI mutates issues, so that the read view and list never go stale.
19. As a user, I want labels restricted to the five triage values everywhere, so that the UI and the AI can never drift into inconsistent label vocabularies.
20. As a user, I want the modal to reuse the app's component library primitives, so that it looks and behaves like the rest of the app.
21. As an AI agent, I want label validation enforced in the shared command layer, so that my MCP writes and the user's UI writes obey the same rules.

## Implementation Decisions

- **Issue Detail Modal (modified from the existing issue modal component):** the single modal component gains a mode state: `read` | `edit`, plus the existing field sub-page state nested inside edit mode. Mode resets to `read` each time the modal opens for an existing issue; create flow opens directly in the action-list (create has no read mode).
- **Read mode composition:** built from Component Library Primitives (Badge for the label and state, Button for the Edit/Done header toggle, Text/Heading for typography) and renders the markdown body through the same renderer used by the panel's inline expansion. To avoid two drifting markdown definitions, the issue-body renderer is extracted into one shared component consumed by both the panel and the modal.
- **Read mode content:** issue number, open/closed state, label, author, created/updated timestamps, and the full rendered body — the complete issue content.
- **Edit mode idiom preserved:** the existing action-list (Edit title / Edit body / Set label / State / Delete / Save) with per-field sub-pages stays as-is; only the new State row is added.
- **Staged State row:** a new action row in edit mode toggles a draft `open`/`closed` value; it is committed by the same Save path (header Done button or `Cmd+Enter`) as title/body/label. No immediate one-click state mutation.
- **Modal keyboard contract:** `e` toggles read → edit (read mode has no text input, so a bare key is safe); `Esc` pops exactly one level (sub-page → action list → read mode → close); leaving edit mode via `Esc` discards unsaved changes; Done/`Cmd+Enter` saves and returns to read mode.
- **Panel trigger changes:** `Enter` on a focused row opens the modal in read mode; right-click opens read mode; the list-level `e`-to-edit shortcut is removed; click-to-expand inline and the remaining expand/collapse keys are unchanged; the `c` create shortcut and empty-state button are unchanged.
- **Closed label vocabulary:** the five triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) become a validated, closed set in the command layer. Issue create and update commands reject any label outside the set. Because both the Tauri UI commands and the MCP tools route through the same command executor, one validation point covers both write paths. Validation is a pure function of the label list — a small deep module testable in isolation.
- **Single label per issue:** with the vocabulary closed and the picker staging exactly one label, Save continuing to write a one-element label array is correct; the data model's array storage is unchanged.
- **Live updates:** no changes to the CDC/`issues-changed` refresh flow; the modal reads from the issue object passed in at open time, and the panel's existing refetch keeps the list current after saves and AI-driven mutations.
- **Domain documentation:** `.aw/CONTEXT.md` already records the **Read/Edit Modal** and **Issue Detail Modal** terms, the interaction decisions, and the closed label vocabulary; keep it in sync if implementation reveals a deviation.

## Testing Decisions

- **What makes a good test:** tests assert external behavior only — what renders, what a keypress does, what command payload a save sends — never component-internal state names or DOM structure trivia. Frontend tests mock the Tauri invoke boundary, matching existing practice.
- **Issue Detail Modal component tests** (new, modeled on the existing Issue Tracker panel tests): opens in read mode for an existing issue and renders its content; `e` and the header button toggle into edit mode; `Esc` pops one level at a time and discards unsaved edits when leaving edit mode; Done/`Cmd+Enter` saves and returns to read mode; the staged State row flips the draft and is included in the save payload; create mode is unaffected.
- **Panel interaction tests** (extend the existing panel test suite): `Enter` opens the modal in read mode; right-click opens read mode; the `e` key no longer opens the editor from the list; click still expands/collapses a row inline.
- **Label validation unit tests** (Rust, in the command executor's existing test module): create and update reject out-of-vocabulary labels and accept all five triage labels; error message names the offending label.
- **Prior art:** the Issue Tracker panel component tests (mocked invoke, keyboard-driven behavior assertions) for the frontend, and the command executor's issue command unit tests for the Rust validation.

## Out of Scope

- Comments or any issue discussion thread.
- Multi-label support or user-defined labels — the vocabulary is closed at five, one label per issue.
- Changing the create-issue modal's action-list idiom.
- Inline field editing inside the read view (fields are edited only via edit mode).
- An immediate, one-click close/reopen button (GitHub-style) — state changes are staged and saved.
- Removing or redesigning the inline row expansion.
- Bulk operations, multi-select, or issue reordering.

## Further Notes

- This PRD is a direct follow-on to the Local Issue Tracker Panel PRD; one of that PRD's original decisions ("the panel is read-only for the user; all Issue mutations flow through the AI") has since been superseded in the codebase and is formally corrected here and in `.aw/CONTEXT.md`.
- The Read/Edit Modal pattern is now used in three places (Node Edit Modal, New Workspace Modal, Issue Detail Modal). The issue variant deliberately keeps its action-list edit mode rather than adopting a form — per-feature idioms may differ under the shared read/edit shell.
