# 01 — Response shaping and explicit acks

**What to build:** Reshape every agent-facing MCP response so it carries only what the agent uses and always acknowledges what changed. Agent-facing payloads omit `session_id`, `created_at`, and `updated_at`; `metadata` is emitted as real nested JSON rather than a double-escaped string. Delete tools return `{deleted: true, id}` instead of empty output; other mutating tools return the changed entity (or an explicit change summary). `issue_list` returns a summary projection (`number`, `title`, `labels`, `state`) while `issue_get` remains the full-body fetch; `c4_diagram_list` returns metadata only while `c4_diagram_get` returns the diagram JSON. This is the shared response path the tag/source folds will emit through, so it lands first.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Agent-facing responses omit `session_id`, `created_at`, `updated_at`; the Tauri/UI read path keeps them
- [ ] `metadata` is returned as nested JSON, not an escaped string
- [ ] Every delete tool returns `{deleted: true, id}`; other mutations return the changed entity or an explicit change summary
- [ ] `issue_list` returns `number`, `title`, `labels`, `state` only (no `body`); `issue_get` still returns the full body
- [ ] `c4_diagram_list` returns metadata only; `c4_diagram_get` still returns the diagram JSON
- [ ] Tests extend the existing `mod tests` (`setup()`/`extract_text()`) covering the shape of list vs get, ack payloads, and absence of timestamps/`session_id`
