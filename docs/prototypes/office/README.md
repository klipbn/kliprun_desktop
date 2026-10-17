# A living Office

Open `index.html` directly in a browser. This standalone, offline HTML prototype contains three **office floor plans**, with independent moving characters and shared furniture:

- **Shared loft:** a build floor, review room, and coffee corner connected by a continuous aisle.
- **Team rooms:** a dedicated Atlas room with shared desks; Aurora and the commons occupy neighboring rooms.
- **Long studio:** a long workbench between a planning board and a lounge.

The larger Atlas lead supervises three smaller, similarly colored helpers. One helper is initially present; **Call subagents** introduces two more through the entrance. The demo progresses through welcome, briefing, work and supervision, review, waiting for a human, coffee, and departure. The scene buttons jump to an episode. Pause stops both travel and decorative animations. Reduced motion preserves state changes while skipping travel and other animations.

Characters follow grid routes around desk footprints and partitions. Objects and residents are sorted by floor depth. The lead visits its helpers while they work. During review they gather around the lead; during the coffee episode they move to the lounge. This is a visual demonstration, not a scheduler or an agent execution system.

Select a character with a pointer or keyboard to see its task and parent relationship below the floor. Selection follows an already visible mock terminal, and leaves a hidden terminal closed. The terminal can appear below or on the left and can be resized using its divider or arrow keys. The scene recomposes into a low office when vertical space is limited. Zoom focuses on the selected coworker; drag the background to pan; **Fit** restores the whole floor.

Settings control speed, motion, name tags, team connections, lighting, and terminal position. Preferences persist locally when browser storage is available. OS reduced motion always wins. **Restart the day** resets the scene and settings.

Six base residents come from `docs/screenshots/mock-api.json`. Two explicitly fictional additional helpers (Inspect API contract, Check edge cases) demonstrate delegation from the Atlas lead. The terminal transcript is simulated and no commands execute. There are no external assets, dependencies, network requests, or live-session data.

`verify.js` is an async Playwright callback accepting `page`. Serve this directory at `http://127.0.0.1:8768` to run it. It checks all three plans at 1440×1000, 1200×800, and 980×660, with the terminal hidden, below, and on the left, plus simulation and control behavior. Review screenshots belong in a temporary directory, not the product screenshot collection.

This iteration replaces the earlier card-based study. Production Swift/React code is not changed.
