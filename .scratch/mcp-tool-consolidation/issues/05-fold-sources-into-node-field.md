# 05 — Fold node sources into a Node `sources` field

**What to build:** Promote a node source reference from a first-class row to a `sources` array field on the Node (each entry: `url`, `source_type`, `sort_order`). The agent sets sources inline when creating or updating a node, and inside a single `canvas_import` call, and reads them back off the node. The `node_source_add`, `node_source_list`, and `node_source_remove` tools are removed. A schema migration copies existing source rows onto their owning node's `sources` and drops the table. Sequenced after ticket 04 because it shares the same node tools (`node_create`/`node_update`/`canvas_import`) and keeps schema versions monotonic.

**Blocked by:** 04 — Fold tags into a Node `tags` field.

**Status:** ready-for-agent

- [ ] `node_create`, `node_update`, and `canvas_import` accept optional `sources`; node reads return `sources` inline
- [ ] `node_source_add`, `node_source_list`, `node_source_remove` removed from the tool set and registry
- [ ] Schema version bump migrates existing source rows into the owning node's `sources`, then drops the table
- [ ] `canvas_import` can produce a node with both `tags` and `sources` plus edges/groups in one all-or-nothing call
- [ ] Tests: setting/reading `sources` via the three tools; a migration test seeding source rows at the prior schema version and asserting they land on nodes and the old table is gone
