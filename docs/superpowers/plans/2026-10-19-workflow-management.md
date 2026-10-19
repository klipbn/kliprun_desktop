# Workflow management and scoped history

User request: Run history belongs only to the selected workflow; workflow sidebar actions for hide, delete and rename; exact time; useful ideas from the Kangentic stage demo.

Reference inspected: https://kangentic.github.io/kangentic/stage.html (its embedded local demo). Adopt search, compact actions, Auto layout and Run order within the existing sequential executor. Preserve existing dark design, active-run ownership, immutable snapshots and explicit publication permission. Hidden workflows remain recoverable; hiding does not stop a run. Deletion requires a local reviewable dialog and is unavailable while a run is active.

`update_plan` is unavailable in this session; execution state is recorded here. Existing uncommitted Workflow changes are part of this conversation and are preserved. No commit, push or release is requested.

- [x] Inspect current history/selection, persistence, sidebar and the reference demo.
- [x] Scoped run selection and persistent workflow metadata actions with exact timestamps/durations. Tests pass for history isolation, snapshot preservation, invalid names, active-run deletion guards and metadata surviving canvas saves.
- [x] Sidebar actions/search/hidden view and local rename/delete dialogs, Auto layout and Run order. Two-workflow fixture checks pass for independent histories, rename, persisted hide/restore, active-run delete protection, delete/cancel, exact time and normal/narrow layouts.
- [x] Docs, full relevant tests/type checks, packaged build/signature and final diff review. 324 engine/shared + 172 client tests passed, as did engine typecheck, web production build, packaged app build and strict/deep codesign verification. Browser checks used the fictional fixture at 1440×1000 and 620×800.

No real agent task, remote publication, repository commit or release was performed. The reference supplied interaction ideas; no external app state or user workflow data was changed during verification.
