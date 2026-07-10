# Ref labels: HEAD indicator, tag prefix stripping, overflow

Labels: `ready-for-agent`

## Parent

`.scratch/git-tree-improvements/PRD.md`

## What to build

Polish ref label rendering in `src/panels/GitTreePanel.tsx`:

1. **HEAD indicator**: When a commit's refs array includes an entry starting with `HEAD ->` (e.g., `HEAD -> main`), render a distinct visual marker on the commit dot. Options: a bold ring around the dot, a slightly larger dot, or a small caret/triangle beside it. The indicator must be distinguishable from non-HEAD commits at a glance.

2. **Tag prefix stripping**: In ref label rendering, when a ref name starts with `tag: ` (e.g., `tag: v1.0`), strip the prefix and render only `v1.0`. Tag labels should use a tag-colored pill (existing `--ref-tag` CSS variable) while branch names use branch-colored pills (`--ref-branch`). Remote-tracking branches (`refs/remotes/`) use remote colors (`--ref-remote`).

3. **Ref label overflow handling**: When many refs point to the same commit, labels can overflow the graph column width. Compute the total width of all labels (approximate text width from character count × average char width, plus pill padding). If it exceeds the available `graphCol` width:
   - Option A: Truncate individual label text with `...` and reduce padding
   - Option B: Show the first 2-3 labels plus a `+N` overflow indicator pill
   - Use the simpler approach that matches Zed's behavior (start with Option B)

## Acceptance criteria

- [ ] HEAD commit shows a visible indicator distinct from non-HEAD commits
- [ ] `tag: ` prefix is stripped from tag labels (e.g., shows `v1.0` not `tag: v1.0`)
- [ ] Tag labels use tag-colored pills, branch labels use branch-colored pills
- [ ] When ≥4 refs point to a commit, labels don't overflow the graph column boundary
- [ ] All ref types render: local branches, remote tracking branches, lightweight tags, annotated tags
- [ ] `npx tsc --noEmit` passes

## Blocked by

None — can start immediately.
