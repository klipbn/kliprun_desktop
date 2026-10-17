# Projects interaction prototype

Open `index.html` directly in a browser. The standalone HTML uses KlipRun's default dark palette and embeds `board`, `recent_sessions`, and session metrics derived from `statistics_dataset` in `docs/screenshots/mock-api.json`. It makes no API requests and starts no agents.

The compact revision uses a single toolbar and flat session rows: 36 px on wide windows, 49 px with metrics on a second line in narrow windows. The sidebar is 184 px wide on desktop. Promotional headings, subtitles, and framed groups are removed; project creation is available through the plus button beside Projects.

Project group headings toggle their session lists with a directional chevron and `aria-expanded`. The button beside All sessions collapses or expands every current group. The Projects heading in the sidebar toggles the project navigation. Collapse state persists. Session tags have been removed. Select an individual project to organize its sessions into groups. New group creates a group scoped to that project. Group names are unique within the project (case-insensitive); Uncategorized is reserved for sessions with no group. Groups are collapsible and remain visible when empty so sessions can be dropped into them. Search also matches group names.

Worked is the sum of the fixture session's observed running intervals across the available history, excluding idle periods and subagents. Top model is ranked by summed attribution duration within those running intervals, not by the latest model or token count. The fixture's intervals and attributions do not overlap within a session. Context is the latest board snapshot's used/limit percentage, with exact token counts in the tooltip and preview; it is not cumulative token consumption. Missing observations remain unknown and display a dash. Production data will need the equivalent metrics API; the mock only embeds these derived totals.

Projects appears immediately before Kanban. The sidebar has All sessions, Favorites, then the individual project list. All sessions is the startup view; there is no separate Projects overview tab. All sessions shows assigned sessions first and a No project group last, including when sorted by last update. Favorites also includes unassigned favorites. Within an individual project, sessions are grouped by category; All sessions and Favorites retain their project-level grouping.

The initial demo assigns six sessions to projects and leaves Prepare API rollout in No project. Aurora illustrates Research (Review database migration and Investigate flaky tests), Work (Refine onboarding UI), and Uncategorized (Draft release notes). Existing saved assignments are preserved; Reset demo loads this new sample. Stars mark favorites, checkboxes select sessions, and selection reveals bulk actions. Move sessions through the move dialog or drag them onto a project; choose No project to remove an assignment. The move dialog also selects a group within the destination project. Sessions can be dragged onto group headings or moved in bulk. Moving to a different project clears the previous group unless a destination group is selected. Moves have an Undo action restoring both project and group, and never change the session's original folder. Project creation, search, agent filtering, grouping, and session previews are interactive. Selecting a session opens its preview; Resume only displays a simulation notice.

The Kanban tab demonstrates the full-width board without Recent Sessions. Other toolbar buttons display a notice explaining that they are outside this preview. Preferences are stored under `kliprun.projects.prototype.v1`; Reset demo restores the fictional starting state. This storage is separate from production preferences. The prototype has no dependencies or external assets.

Production Swift and React code is not modified. This is a design for review before implementation, not a release. Production integration will need durable session metadata and native navigation support; neither is implemented here.

To review through HTTP, run from the repository root:

```sh
python3 -m http.server 8769 --bind 127.0.0.1 --directory docs/prototypes/projects
```

`verify.js` is a Playwright callback taking `page`. It uses an isolated browser context, checks collapse and keyboard expansion, group creation and duplicate names, bulk grouping, drag into empty groups, project-scoped persistence, cross-project moves and undo, metric values and unknown data, favorites, bulk moves and undo, drag and drop, creation, filtering, persistence, preview behavior, Kanban navigation, and normal/small layout bounds. Screenshots are written to `/private/tmp`, outside the committed product screenshot collection.
