# Three independent Hermes layouts

Open `index.html` directly in a browser. It is a self-contained, local design
prototype; no server, installation, network request, or Hermes process is needed.

Use the three selectors above the app to compare placements:

- A: a movable companion window over the board, independent of session details.
- B: a dedicated Hermes section with conversation navigation and, on wide screens,
  the chat and saved summary side by side. Kanban returns to the board.
- C: a resizable bottom dock beside Terminal, with the board and session details
  above it. In narrow windows, the upper area shows either the board or its
  selected details; Close details returns to the board. The Terminal tab is a
  static, fictional terminal preview.

In every layout, cards open the original User, Agents T, Agent, Models and Kanban
views. Hermes is absent from the card tabs and card content. Opening another card
never changes the Hermes conversation or its context. Select a conversation in
Hermes, choose its context explicitly, or use Use selected card to attach a card.

- Use Summary and Chat in compact layouts; both are visible in wide B/C layouts.
- Type a question in English or Russian, or use the suggested questions.
- Conversations and drafts remain separate for each session and the whole board,
  and survive switching between the three layouts.
- Close/reopen Hermes independently of session details, or reset the demo.
- Move A by dragging its header or using arrow keys while the header is focused.
  Resize C by dragging its top edge or focusing the separator and using Up/Down.
- State lasts until a page reload or reset.

Session identities, paths, titles, models, columns, branches and context percentages
come from `../../screenshots/mock-api.json`. The search-session User and Agent
text and its bash tool observation also match that fixture. The other example
transcripts are fictional; Models and Kanban preserve the fixture's empty states.
Hermes briefs, check counts, file counts and replies are fictional design
examples, visibly marked as simulated.
No live session data is read, and no agent, model, gateway or messaging API is called.

This demonstrates layout and interaction only. It does not implement the app's
Hermes integration. Review screenshots belong in `/private/tmp`, not the gallery.
