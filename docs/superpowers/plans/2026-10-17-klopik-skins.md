# Klopik skins

Requested scope: Settings → Appearance selects Default plus five new Klopik skin sets. Each set distributes stable variations among agents and subagents. Preserve the current Default artwork and existing movement, reduced motion and selection behavior.

Chosen sets: Robot, Astronaut, Knight, Wizard, Explorer; four equipment variants per new set, deterministically selected by session ID. Draw as SVG using the existing animation anchors. Generate native selection thumbnails from the same SVG component. Apply the selection immediately to Office and leaderboard avatars; save it through AppPreferences.

`update_plan` is unavailable; this checklist tracks execution.

- [x] test native/web preference validation, persistence and stable variant selection; implement the six skin choices.
- [x] Add five SVG skin sets, shared avatar rendering, Settings thumbnails and the Appearance selector.
- [x] Check all skins and movement in normal/small layouts, run relevant tests/builds, update documentation, generate the local app and verify its signature.

Verified: 245 server/shared + 132 client tests; 84 Swift tests including all six preference values and full-card clicks. Browser coverage passed 36 skin/layout/size combinations, live updates, stable variants, leaderboard parity, animations, reduced motion and original Default artwork. Wizard departure/return checks passed in every floor plan. Native thumbnail PNGs were generated from Mascot with transparency, packaged byte-for-byte, and the rebuilt app passed strict deep signature verification. No running user app or agent was restarted.
