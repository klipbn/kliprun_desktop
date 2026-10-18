import { expect, test } from "bun:test";
import { statusSessions } from "../components/StatusBar";

test("footer lists identify running agents and unread completions without unresolved terminals", () => {
  const cards = [
    { session_id: "root", column: "running" }, { session_id: "child", column: "running", parent_id: "root" },
    { session_id: "new", column: "idle" }, { session_id: "read", column: "idle" },
    { session_id: "question", column: "attention" }, { session_id: "unlinked", column: "idle", terminal: { session_id: null } },
  ];
  const lists = statusSessions(cards, card => card.session_id === "read");
  expect(lists.running.map(card => card.session_id)).toEqual(["root", "child"]);
  expect(lists.unread.map(card => card.session_id)).toEqual(["new"]);
});
