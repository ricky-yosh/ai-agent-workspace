# 03 — Prune redundant `*_get` and `issue_close`

**What to build:** Remove the canvas single-fetch tools that return byte-identical output to their `*_list` element, and the `issue_close` convenience tool that duplicates `issue_update(state)`. After this, canvas entities are read via their `*_list`, and issue state transitions go through one canonical tool.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `node_get`, `edge_get`, `group_get`, `canvas_get` removed from the tool set and registry
- [ ] `issue_close` removed; closing an issue works via `issue_update(state:"closed")`
- [ ] `issue_get` and `c4_diagram_get` are retained
- [ ] A test asserts the removed tools are absent and that `issue_update(state:"closed")` closes an issue
