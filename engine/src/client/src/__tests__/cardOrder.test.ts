import { expect, test } from "bun:test";
import { moveCard, orderedCards, validateCardOrder } from "../cardOrder";

test("moves cards both ways, preserving incoming sessions and removing absent ones", () => {
  expect(moveCard(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  expect(moveCard(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  const cards = [{session_id:"c"},{session_id:"a"},{session_id:"new"}];
  expect(orderedCards(cards, ["gone", "a", "c"]).map(c=>c.session_id)).toEqual(["a", "c", "new"]);
  expect(moveCard(["a", "b"], "outside", "b")).toEqual(["a", "b"]);
});

test("rejects malformed saved orders and deduplicates IDs", () => {
  expect(validateCardOrder({idle:["a","a",3], running:["b"], attention:"bad"})).toEqual({idle:["a"],running:["b"],attention:[]});
});
