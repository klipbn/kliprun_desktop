# Office exit animation

Approved request: removed agents and subagents walk through an EXIT door instead of disappearing immediately. Keep existing movement, layouts, counters, selection and reduced-motion behavior.

`update_plan` is unavailable; this checklist tracks execution.

- [x] retain departing characters separately from live session counts; add a reachable exit to each floor plan and test disappearance/return/reduced-motion behavior.
- [x] Animate the departure path to the exit and disable selection for departed sessions. Verify root agents and helpers, cancellation, layout changes and empty-office behavior in the fixture preview.
- [x] Update docs, run relevant tests/build, refresh the Office screenshot, build the isolated app and verify its signature. No user processes are restarted and no release is published.

Verification: 245 server/shared and 129 client tests passed (35 Office tests). The fixture-only Office regression passed 15 layout/viewport combinations. Departure browser checks passed for parent/helper removal only at the exit, reappearance, live counters, selection, resizing, empty office and reduced motion. Client build, isolated app build, strict deep signature verification and diff whitespace checks passed. Office screenshot refreshed from mock-api.json only.
