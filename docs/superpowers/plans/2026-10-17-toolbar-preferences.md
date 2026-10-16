# Toolbar and default-view refinements

Scope approved in the current chat. Execute locally; preserve existing staged
changes. No commits, pushes, releases or user-agent termination. The session
does not expose update_plan, so this checklist tracks execution.

## 1. All five default details tabs — completed

- [x] Add failing preference round-trip and rendered-tab regressions.
- [x] Allow User, Agents T, Agent, Models and Kanban in Swift preferences, the
  native bridge and Settings; verify saved values and live tab selection.

## 2. Compact top toolbar and navigation — completed

- [x] Replace text with existing icons, reuse harness logos, and keep accessible
  names/tooltips and agent actions. Order primary controls Kanban, Git, Office,
  Usage, Statistics, Settings; keep Updates/help available as utility controls.
- [x] Align native shortcuts, help and startup choices with the new order:
  Control+1 Kanban, +2 Git, +3 Office, +4 Usage, +5 Statistics; Command+, Settings.
- [x] Verify icon actions, tooltips, order and normal/small layouts in the fixture
  preview; update existing browser checks and screenshot captures.

## 3. Terminal hover feedback — completed

- [x] Add a focused native hover treatment to new-tab, position, expand/restore,
  hide and session-tab close controls, with usable hit areas and tooltips.
- [x] Inspect normal and hover states in an isolated native preview and preserve
  terminal selection, closing, resizing and launch behavior.

## 4. Final verification — completed

- [x] Run engine/client tests, relevant Swift tests and production builds.
- [x] Update README/CHANGELOG and fixture screenshots/provenance.
- [x] Review tracked/staged changes without altering the index; run whitespace
  checks and verify a separate app bundle with strict deep codesign verification.
- [x] Report the completed local artifact and actual validation results.

## Verified outcome

- 229 engine/shared and 79 client tests passed (308 Bun tests total).
- 72 Swift tests passed, including five parameterized default-tab cases and
  clicking all five choices in Settings. Invalid/legacy tabs retain the
  Agents T fallback.
- Browser checks verified icon-only controls, harness assets, native action
  targets, the requested order, matching shortcut tooltips/help, update-available
  feedback, and all five live default tabs at 1440, 900 and 500 px.
- Existing session-details, Git workflow and Git resizing browser checks passed;
  no browser exceptions or external requests were observed.
- An isolated native hover preview used the production modifier and actual
  pointer events. New-menu, position, expand, hide and session-close controls
  changed their rendered pixels on hover and restored their initial pixels on
  exit. The menu highlight wraps the entire Menu because its native label alone
  does not receive hover. The probe restored the previous cursor and app focus.
- All twelve fixture-only screenshots were refreshed; both capture callbacks
  reported zero external requests. README and CHANGELOG were updated.
- Production client/app builds passed. The separate artifact at
  `/private/tmp/KlipRun-ui-controls-preview.app` passed strict deep codesign
  verification; all native executable/data sections and client assets match the build outputs (the signature itself changes during app signing).
- Tracked, staged and new-file whitespace checks passed; the final diff was
  reviewed. Existing staged work was preserved. No commits, pushes, releases
  or live-agent launches were performed.
