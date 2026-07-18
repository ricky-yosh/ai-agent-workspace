# 04 — Fold tags into a Node `tags` field

**What to build:** Promote a Tag from a first-class row to a decorative `tags: string[]` field on the Node. The agent sets tags inline when creating or updating a node, and inside a single `canvas_import` call, and reads them back off the node. The `tag_add`, `tag_remove`, and `tag_list` tools are removed. A schema migration copies existing tag rows onto their owning node's `tags` and drops the tag table. Tag changes emit a Node `updated` event (no dedicated tag event), which is correct for pure decoration.

**Blocked by:** 01 — Response shaping and explicit acks (node responses emit through the shared shaped path).

**Status:** ready-for-agent

- [ ] `node_create`, `node_update`, and `canvas_import` accept optional `tags`; node reads return `tags` inline
- [ ] `tag_add`, `tag_remove`, `tag_list` removed from the tool set and registry
- [ ] Schema version bump migrates existing tag rows into the owning node's `tags`, then drops the tag table (follows the rusqlite sync migration pattern)
- [ ] Tag changes produce a Node `updated` `DomainEvent`/`ChangeEvent`
- [ ] `CONTEXT.md`'s amended `Tag` definition matches the implementation
- [ ] Tests: setting/reading `tags` via the three tools; a migration test seeding tag rows at the prior schema version and asserting they land on nodes and the old table is gone
