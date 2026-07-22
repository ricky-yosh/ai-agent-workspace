# 01 — Extract shared issue-body markdown renderer

**What to build:** Prefactor only. The markdown rendering used by the Issue Tracker panel's inline row expansion (GFM checklists, code blocks/inline code, blockquotes, links, headings) is extracted into one shared component, so the Issue Detail Modal's read view (ticket 03) composes it instead of copying it. No visible behavior change.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A single shared component renders an issue's markdown body and is used by the panel's inline row expansion
- [ ] No visible behavior or styling change in the inline expansion
- [ ] Existing Issue Tracker panel tests pass unmodified
