# Native macOS menus

Requested: populate File, Edit, View and related system menus with meaningful existing KlipRun actions. Reference: Zed's macOS keymap and context-specific binding documentation (https://zed.dev/docs/key-bindings and https://github.com/zed-industries/zed/blob/main/assets/keymaps/default-macos.json).

Keep the established Control+1–6 view order and Command+1–9 terminal tabs. File offers creation, Open Repository, Save File and context-aware Close; Edit preserves native clipboard actions, routes editor undo/redo to CodeMirror, and provides Find; View owns terminal visibility/position/zoom and data refresh; Terminal owns tab operations; Help includes shortcuts and diagnostics. Preserve unsaved-file and active-process confirmation flows. No new repository writes beyond explicitly chosen Save, and no agent termination while testing.

Use a typed web menu command/state bridge restricted to the authenticated main frame. Web commands call existing UI handlers and CodeMirror APIs; native text fields and terminals keep responder-chain behavior. Commands are disabled when their target is unavailable or blocked by a modal.

`update_plan` is unavailable; this checklist tracks work.

- [x] implement and test web command routing/capabilities, editor history/search, save/close behavior and session creation/search.
- [x] Implement native focus-aware menu routing and arrange File/Edit/View/Navigate/Terminal/Help, retaining standard Window controls.
- [x] Verify native menu/shortcut behavior, browser file/search interactions, update docs/help, build the isolated app and verify its signature.

Verification completed: 245 server/shared + 133 client tests; 87 Swift tests including real WKWebView command dispatch, native text-field undo, close-target selection and terminal cycling. Browser menu checks covered project creation, find, CodeMirror undo/redo, in-memory save, safe close/cancel, unsaved-state reporting and refresh preserving edits. Existing file-editor regression passed including undo across tabs and save/close. A disposable native SwiftUI probe built the actual DesktopCommands menu definition, checked File/Edit/View/Navigate/Terminal/Window/Help, verified a unique Command+W and exercised navigation, save, close, undo, find and full-screen shortcuts against isolated action targets. Built dist/session-workspace/KlipRun.app; strict deep signature verification passed. No user agent or existing app was restarted, and no external publication occurred.

## Follow-up: appearance defaults — completed

- [x] Set fresh/invalid theme preferences to Graphite and terminal position to Left, preserving explicit saved choices. Rename the original palette to Midnight without changing its stored key.
- [x] Order position controls Left → Bottom in Settings and View, and make Reset terminal settings restore Left. Verify preference and UI tests, refresh docs/screenshots and rebuild the isolated app.

Appearance follow-up verified: 88 Swift tests, 245 server/shared tests and 134 client tests passed; browser checks confirmed fresh Graphite and preserved explicit Midnight. Ten fixture screenshots refreshed. Isolated app build and strict deep signature verification passed.
