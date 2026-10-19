# Terminal tab wheel scrolling

Authorized local fix: scroll the terminal tab strip with an ordinary mouse
wheel without Shift. Preserve horizontal trackpad input, tab actions, automatic
selection reveal, and terminal-content scrolling. Earlier uncommitted work stays
intact. `update_plan` is unavailable, so this checklist tracks execution.

## 1. Reproduce and fix input routing — completed

- [x] Add native regressions for vertical wheel scrolling in both directions,
  bounds, pixel versus line units, horizontal input/modifiers, and SwiftUI hosting.
- [x] Add a small AppKit bridge inside the existing horizontal SwiftUI content.
  Scope wheel interception to the bridge's visible area and owning window;
  preserve normal hit testing and native horizontal/modified events.
- [x] Verify the regression failures, implement the mapping, and rerun them.
  The first test run failed on the missing bridge; the implementation passes all
  three regressions, including real SwiftUI hosting at 400 and 240 points wide.

## 2. Documentation and verification — completed

- [x] Update README and Unreleased CHANGELOG with the new tab-strip behavior.
- [x] Run `zsh scripts/test.sh`: 108 tests passed in 2 suites. Inspect the final
  diff and check whitespace, including all new files: no whitespace errors.
- [x] Build `/private/tmp/KlipRun-terminal-tab-wheel-20261019.app` using
  `KLIPRUN_APP_OUTPUT` and `zsh scripts/build.sh`: succeeded. Verify with
  `codesign --verify --deep --strict`: succeeded. The running app and user agents
  were not replaced or restarted.
