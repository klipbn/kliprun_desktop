# Workflow usability implementation plan

User request: a collapsible workflow list, resizable list/details panes, readable agent responses instead of raw logs, review/Git task presets, visibility into launched agents, cumulative task duration and completion notifications.

This extends the uncommitted Workflow implementation already present in this conversation. No commits, pushes or releases are authorized. `update_plan` is unavailable; this file records execution state.

- [x] Inspect current Workflow, storage, agent protocols, terminal bridge, notification path and existing resize patterns.
- [x] Compact readable agent responses and recovery artifacts, cumulative timing, list dates and reusable review/Git presets. Protocol, timing, preset and persistence tests pass.
- [x] Lightweight running-agent/notification summaries and native completion/review notifications with deduplication and navigation. Engine/API tests and 110 Swift tests pass.
- [x] Persistent collapsible/resizable panes, task responses, presets, active agents and durations in the web UI. Fixture interactions verified at 1440×1000 and 620×800; sizes/visibility restore, review is readable, agents appear during execution, repeated runs accumulate time and presets retain explicit branch choices.
- [x] Docs, full tests/type checks, signed app build/verification and final changes review. 321 engine/shared + 171 client tests, 110 Swift tests, engine typecheck, client build, full package build, strict/deep codesign and diff checks passed. The fixture browser scenario also verified navigation from another view directly to the notification's run and task, plus mouse and keyboard resizing.

Verification used fixture data, disposable CLI adapters and local test repositories. No real model tasks, GitHub/GitLab writes, commit, push or release was performed. Existing raw logs are left available only for recovery of older attempts; new attempts do not create them.

Decisions: task cards remain generic. Review presets cover code, text and files; publication presets cover push and MR/PR without guessing branches. Total task time includes finished attempts across runs plus active elapsed time, never paused/human waiting time. Responses contain assistant prose only; structured review JSON is rendered as verdict, summary and findings. Raw logs are removed from new runs; old recovery records remain readable. Sidebar rows show name, date and last-run state. Active-agent visibility works across workflows. Native notifications reuse current user preferences and route to the relevant workflow even when another section is open.
