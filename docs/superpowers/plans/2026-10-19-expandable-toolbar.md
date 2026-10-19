# Expandable toolbar, variant C

The user selected variant C from `docs/prototypes/toolbar/index.html` in this
chat. Execute locally without commits, pushes, releases, or live-agent changes.
`update_plan` is unavailable in this session; this checklist tracks execution.

## 1. Preference, bridge and two-row toolbar — completed

- [x] Add and run failing regressions for the compact default, expanded state
  round trip, initial/live web preferences, and the toolbar toggle action.
- [x] Add `toolbarExpanded` to existing `AppPreferences`, its web payload and
  TypeScript reader. Route `toggle-toolbar-labels` through the existing secured
  desktop-action handler and `DesktopStore.updatePreferences`.
- [x] Verify client bridge tests (14 passing) and native persistence. All 105
  Swift tests passed, including the real WebKit action handler, fresh documents,
  and a new store instance using disposable defaults.

- [x] Add a fixture-only browser regression for expand/collapse, keyboard,
  navigation, native action targets, current selection, update state, and layout.
- [x] Keep the current compact toolbar as the default. Expanded mode shows
  agent/utility labels on top and navigation labels in a separate second row,
  with a permanently accessible toggle on the right. Reuse icons, theme tokens,
  tooltips, and shortcut help. Accommodate narrow panes beside the terminal.
## 2. Browser verification — completed

- [x] Verify the real rendered toolbar at 1440, 980, 700, and 500 px. At 980 px
  and above it uses exactly two rows; smaller panes wrap without clipped labels.
  Keyboard, native actions, update feedback, navigation, and selection checks
  passed in Graphite and Daybreak without browser exceptions.

## 3. Documentation, build and final review — completed

- [x] Document the toggle and persistence in README and Unreleased CHANGELOG.
- [x] Run `bun run test` in `engine`, `zsh scripts/test.sh`, and a production
  build into a separate app bundle so the running user's app is not replaced.
- [x] Verify browser regressions and light/dark layouts using only mock data;
  inspect temporary screenshots, final diff, whitespace, and packaged codesign.
- [x] Report the implementation and actual checks. Keep versions aligned at
  0.0.26; no release was requested.

Verified artifact: `/private/tmp/KlipRun-toolbar-C.app`. Its 33 client files
match the production build byte for byte, and strict deep codesign verification
passed. All engine/client tests passed (including 156 client tests), as did all
105 Swift tests and the fixture-only browser regression. Final tracked/new-file
whitespace checks and diff review passed. Temporary preview/test processes were
closed; no user agents or running app bundles were replaced.
