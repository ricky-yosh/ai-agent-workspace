# PRD: Local Issue Tracker Panel

## Problem Statement

When the AI works on a project, the work it is tracking — what it plans to do, what it found, what is blocked, what it has finished — lives only in the chat transcript. The user has no durable, glanceable view of that work. They cannot see, at a glance, the open items for the current project, which ones are waiting on them, or which ones the AI considers resolved. Existing planning artifacts live as markdown files in the repository, which clutter version control and are easy to commit by accident. The user wants a GitHub-style issue list, local to the app, that the AI keeps up to date and that they can simply watch.

## Solution

Add a new **Issue Tracker** panel that the user can place in any workspace area. It shows a GitHub-style list of **Issues** for the current **Session** (the project the workspace belongs to). The AI creates and maintains these Issues as it works — giving each a number, a title, a markdown body, an open/closed state, and triage labels — and the panel updates live as the AI writes. Issues are ephemeral application state stored in the app's database, never written into the repository or working directory, so they never appear in git. The panel is read-only: the user watches, and when an Issue is flagged for their attention they respond by instructing the AI, which keeps a single, attributable write path.

## User Stories

1. As a user, I want to add an Issue Tracker panel to a workspace area, so that I can watch the AI's tracked work without leaving my workspace.
2. As a user, I want to switch any area to the Issue Tracker panel type from the panel selector, so that I can place it wherever I like in my layout.
3. As a user, I want the panel to show the Issues for the Session this workspace belongs to, so that I only see work relevant to the current project.
4. As a user, I want each Issue to display its number (#N), so that I can refer to it unambiguously like a GitHub issue.
5. As a user, I want to see each Issue's title at a glance, so that I can scan the list quickly.
6. As a user, I want an open/closed state badge on each Issue, so that I can tell active work from resolved work.
7. As a user, I want each Issue's labels shown, so that I can see its triage state (for example needs-info or ready-for-human).
8. As a user, I want to distinguish triage labels at a glance, so that I can spot Issues flagged ready-for-human.
9. As a user, I want open Issues listed before closed ones, so that current work is front and center.
10. As a user, I want to click an Issue to expand and read its full markdown body, so that I can understand the details.
11. As a user, I want to see when an Issue was created and last updated, so that I can gauge recency and activity.
12. As a user, I want the panel to update automatically when the AI creates or changes an Issue, so that I see progress in real time without refreshing.
13. As a user, I want the panel to update only when Issues for my Session change, so that unrelated Sessions don't cause noise.
14. As a user, I want the Issue list to persist across app restarts, so that the AI's tracked work is not lost.
15. As a user, I want Issues to never appear in my git status or working directory, so that they don't pollute version control or get committed by accident.
16. As a user, I want a clear indication of who authored each Issue (the AI or me), so that I understand its provenance.
17. As a user, I want the panel to be read-only, so that I can trust the AI is the single source of truth and respond by talking to it.
18. As a user, I want Issues to be removed when I delete their Session, so that stale project data doesn't linger.
19. As a user, when there are no Issues yet, I want a clear empty state, so that I know the tracker is working and simply empty.
20. As a user, I want long Issue lists to scroll gracefully, so that many Issues remain navigable.
21. As a user, I want Issue numbers to be sequential within a Session, so that I can reference them easily.
22. As a user, I want an Issue flagged ready-for-human to signal that I need to act, so that I know when my attention is required.
23. As a user, I want to respond to a ready-for-human Issue by instructing the AI, so that the single AI-write path is preserved.
24. As an AI agent, I want to create an Issue in the current Session with a title and markdown body, so that I can record work or findings for the user to see.
25. As an AI agent, I want new Issues to be assigned the next sequential number within the Session automatically, so that I don't have to manage numbering.
26. As an AI agent, I want new Issues to default to open and labeled needs-triage, so that they enter a sensible initial state.
27. As an AI agent, I want to list the current Session's Issues, so that I can review what exists before creating duplicates.
28. As an AI agent, I want to fetch a single Issue by id, so that I can read its current details.
29. As an AI agent, I want to update an Issue's title, body, labels, or state, so that I can keep it an accurate living description.
30. As an AI agent, I want to close an Issue, so that I can mark work resolved.
31. As an AI agent, I want to reopen a closed Issue by setting its state back to open, so that I can resume work that was prematurely closed.
32. As an AI agent, I want to relabel an Issue (for example ready-for-agent, ready-for-human, or wontfix), so that I can drive a triage workflow the user can follow.
33. As an AI agent, I want to add ad-hoc labels such as bug, so that I can categorize beyond the default vocabulary.
34. As an AI agent, I want to delete an Issue, so that I can remove ones created in error.
35. As an AI agent, I want my writes attributed to "ai" automatically, so that authorship is correct without my specifying it.
36. As an AI agent, I want my Issue operations scoped to the Session I'm connected to, so that I never write to the wrong project's tracker.
37. As an AI agent, I want each mutation to notify the UI, so that the user's panel reflects my changes immediately.
38. As an AI agent, I want updated_at to advance on every change, so that recency is accurate.
39. As an AI agent, I want to label an Issue needs-info when blocked, so that the user knows I'm waiting on them.
40. As an AI agent, I want to mark an Issue wontfix and close it, so that the user sees a rationale for dropped work.
41. As an AI agent, I want listing to reflect the latest committed state, so that I act on current data.
42. As an AI agent, I want numbering to remain isolated per Session, so that two projects can both have an Issue #1 without collision.

## Implementation Decisions

**Storage and ownership**

- Issues are ephemeral application state stored in the app's SQLite database (alongside Sessions, Workspaces, and Templates), never as files in the repository or the Session's working directory. This is a hard, deliberate decision recorded in ADR 0013.
- Issues belong to a Session and are attached by a `session_id` foreign key with `ON DELETE CASCADE`, mirroring how Workspaces relate to Sessions.

**Schema (new `issues` table)**

| Column | Type | Notes |
| --- | --- | --- |
| id | text, primary key | UUID |
| session_id | text, not null | FK to the owning Session, cascade on delete |
| number | integer, not null | Per-Session sequential (#N); unique per Session |
| title | text, not null | Short summary |
| body | text, not null, default empty | Markdown |
| state | text, not null, default `open` | `open` or `closed` |
| labels | text, not null, default `["needs-triage"]` | JSON array of strings |
| author | text, not null | `ai` or `user` |
| created_at | integer, not null | Epoch milliseconds |
| updated_at | integer, not null | Epoch milliseconds |

A unique index over (session_id, number) enforces per-Session numbering; an index on session_id supports listing. The schema version is bumped; the new table is additive.

**Deep module — the Issue repository**

- A single deep module encapsulates all Issue persistence behind a small, stable interface: create, list-by-Session, get, update, close, delete.
- It is the only place that knows the SQL, the `labels` array ↔ JSON-text mapping, per-Session number allocation (next number = current Session maximum + 1), and timestamp management. Numbering, labels encoding, and SQL are intentionally kept inside this boundary rather than split into shallow helper modules.

**Command layer**

- New Issue Command variants cover create, list, get, update, close, and delete. The command result type gains an Issue result and an Issues (list) result.
- Mutating Issue commands emit a new `IssuesChanged` domain event carrying the affected `session_id`. Read commands emit no event.

**AI write path (MCP)**

- The AI mutates and reads Issues exclusively through MCP tools: create, list, get, update, close, delete. The author is fixed to "ai" for all AI-originated writes. The Session is resolved from the connected Session, so the AI always operates on the correct project's tracker.

**User read path (Tauri) and live updates**

- The panel reads through two read-only operations: list Issues for a Session, and get a single Issue. There is no user-facing write operation in v1.
- The live-update contract: a mutation produces `IssuesChanged { session_id }`, which is translated into a UI event that the panel listens for and re-fetches on, filtered by `session_id` so only the relevant panel refreshes.

**Panel**

- A new panel type identified as `issue-tracker` and labelled "Issue Tracker" is registered so it appears in the panel selector for any area.
- The panel is Session-scoped, read-only, shows a list ordered open-first with number, title, state badge, and labels, supports expanding an Issue to read its markdown body, and shows an explicit empty state when there are no Issues.

**Vocabulary**

- Terminology follows `.aw/CONTEXT.md` (Issue, Issue Tracker, Session, Command, DomainEvent, Repository). In-app Issues are kept distinct from the developer-facing `.scratch/<feature-slug>/` markdown planning issues.

## Testing Decisions

**What makes a good test here:** it exercises observable behavior through a module's public interface rather than its internals. Tests assert on returned values and emitted domain events, use realistic inputs, and run against in-memory SQLite for speed and isolation. They do not assert on SQL text, private fields, or other implementation details that can change without affecting behavior.

**Modules that will be tested:**

- **The Issue repository.** Behaviors to cover: a new Issue receives the next sequential number within its Session; numbering is isolated across Sessions (two Sessions can each have #1); numbers may be reused when the deleted Issue held the session's highest number (the UNIQUE index prevents collisions); `labels` round-trip correctly through JSON, including the default `["needs-triage"]` and ad-hoc labels; a partial update changes only the supplied fields and advances `updated_at`; closing sets state to closed and reopening restores open; delete removes the Issue; list-by-Session returns only that Session's Issues, ordered open-first; deleting a Session cascades to remove its Issues.
- **The Issue command layer.** Behavior to cover: every mutating Issue command emits an `IssuesChanged` event carrying the correct `session_id`, and read commands emit no event. This protects the contract the panel's live refresh depends on.

**Prior art:** the existing repository test suites (Session, Workspace, and Layout repositories) use an in-memory database helper and verify behavior through the repository interface — the new Issue repository tests mirror this pattern. The existing command executor test module verifies command behavior and event emission — the new Issue command tests mirror that.

**Not tested in v1:** the MCP tools, the Tauri read commands, and the React panel. These are thin adapters over already-trusted patterns. A frontend test harness (vitest with Testing Library) is available should a panel smoke test be added later.

## Out of Scope

- A per-Issue comment thread / discussion. The AI keeps the Issue body current instead. Comments are an additive fast-follow (a separate comments table) and require no rework of this design.
- User-initiated writes from the panel (the user closing, relabelling, or editing Issues directly). v1 keeps a single AI write path; the user responds by instructing the AI.
- Assignees, milestones, linked or related Issues, and full-text search.
- Filtering and sorting controls beyond the default open-first ordering.
- Cross-Session or global Issue views; the tracker is always scoped to one Session.
- Notifications or badges outside the panel itself.
- Rich Markdown rendering guarantees beyond what is needed to read an Issue body comfortably.

## Further Notes

- Two Issue-like concepts now coexist and must be kept verbally distinct: in-app **Issues** (SQLite, runtime, ephemeral) and the developer-facing `.scratch/<feature-slug>/` planning issues (markdown, committed, dev-time). See ADR 0013.
- The default label vocabulary mirrors the project's existing triage labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. The AI may add ad-hoc labels.
- Because the user cannot write from the panel, a ready-for-human Issue is a prompt for the user to instruct the AI; the AI then performs the corresponding mutation. This is consistent with the app's AI-directed model and keeps authorship clean.
- The companion implementation plan (PLAN.md in this directory) lists the concrete, ordered code touchpoints. This PRD intentionally omits file paths so it does not go stale.
