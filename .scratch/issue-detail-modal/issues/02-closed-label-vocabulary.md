# 02 — Close the label vocabulary in the command layer

**What to build:** Issue create and update reject any label outside the five triage values, enforced once in the shared command executor so the user's UI writes and the AI's MCP writes obey identical rules. This closes the oversight that allowed arbitrary label strings via MCP.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Issue create and update commands reject any label outside `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`
- [ ] The rejection error names the offending label
- [ ] Validation lives in the shared command executor, covering both Tauri and MCP write paths with no duplicate validation
- [ ] Rust unit tests: all five triage labels accepted on create and update; an unknown label rejected on create and update; error message content asserted
- [ ] Existing issue command tests pass unchanged (default `["needs-triage"]` behavior unaffected)
