# Usage provider preferences

Scope confirmed by the user: choose which subscription-limit providers are shown and refreshed in Usage and the lower-right status area, and their display order. Token-history charts within Usage and all Statistics data remain complete and independent.

Design: add Settings → Usage using existing native preferences and the live web-preference bridge. Store enabled provider IDs separately from a complete ordered list, preserving order while toggling. Default to all current providers; support selecting none and restoring defaults. The web poller requests only enabled providers, drops stale in-flight results after changes and leaves Statistics queries untouched. Reordering does not need to refresh providers.

No external write, commit or release is requested. `update_plan` is unavailable; this file is the execution state.

- [x] Inspect preferences, native settings, quota polling/summary/status UI and independent Statistics paths; clarify scope.
- [x] Validated persisted native/web preference contract and Settings controls. Defaults, order/visibility persistence, empty selection, invalid/duplicate IDs and initial/live/reloaded web-view delivery pass.
- [x] Quota polling and Usage/status rendering. Browser checks pass for selected-only startup/manual/automatic requests, reorder without fetching, cancellation of a disabled in-flight request, empty selection and unchanged token-history/Statistics queries. Native toggle/reorder controls and persistence pass.
- [x] Normal/small native and web visual inspection, documentation, full tests/type checks, packaged build/signature and final diff review. 324 engine/shared + 175 client tests and 114 Swift tests passed, along with typecheck, web build, full package build and strict/deep codesign. Browser tests covered timer ticks and cancellation with fixture responses; native tests exercised the Settings controls and startup/reload preference delivery.

The browser MCP transport was unavailable; the browser checks ran successfully using the already-installed local Playwright package and a disposable browser. No live provider request, repository commit, push or release was performed.
