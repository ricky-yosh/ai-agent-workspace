# 04 — Staged open/closed State row in edit mode

**What to build:** Edit mode gains a State action row, giving the user an open/closed affordance for the first time (previously only the AI could change state). The row stages the flip as a draft; Save commits it atomically with title/body/label. Read mode reflects the saved state.

**Blocked by:** 03 — Issue Detail Modal: read mode with edit toggle.

**Status:** ready-for-agent

- [ ] Edit mode contains a State action row showing the current state and the state it will flip to (open → closed, closed → open)
- [ ] Toggling the row stages the draft state without mutating the issue
- [ ] Save (header Done or `Cmd+Enter`) commits the staged state together with title/body/label in a single update
- [ ] Leaving edit mode via `Esc` discards the staged state change along with the other drafts
- [ ] Read mode displays the updated state after save
- [ ] Component tests: the staged flip is included in the save payload; an un-saved toggle does not mutate the issue; read mode reflects the saved state
