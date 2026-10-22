import { expect, test } from "bun:test";
import { loadCardPriorities, saveCardPriorities, updateCardPriority } from "../cardPriorities";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("card priorities persist by session ID and can be cleared", () => {
  const storage = new MemoryStorage();
  const saved = updateCardPriority({}, "codex:session-1", "critical");
  saveCardPriorities(saved, storage);

  expect(loadCardPriorities(storage)).toEqual({ "codex:session-1": "critical" });
  const cleared = updateCardPriority(saved, "codex:session-1", null);
  saveCardPriorities(cleared, storage);
  expect(cleared).toEqual({});
  expect(loadCardPriorities(storage)).toEqual({});
});

test("stored priorities ignore malformed values", () => {
  const storage = new MemoryStorage();
  storage.setItem("kliprun.cardPriorities", JSON.stringify({ valid: "low", invalid: "mystery" }));

  expect(loadCardPriorities(storage)).toEqual({ valid: "low" });
});

test("new Kanban markers survive browser storage", () => {
  const storage = new MemoryStorage();
  const markers = { question: "question", warning: "warning", urgent: "urgent", blocked: "blocked" } as const;
  storage.setItem("kliprun.cardPriorities", JSON.stringify(markers));

  expect(loadCardPriorities(storage)).toEqual(markers);
});

test("desktop priorities survive a new web origin and clearing a flag", () => {
  const storage = new MemoryStorage();
  const host = {
    kliprunCardPriorities: { session: "critical" },
    webkit: { messageHandlers: { cardPriorities: { postMessage: (value: unknown) => { persisted = value; } } } },
  };
  let persisted: unknown = host.kliprunCardPriorities;
  const priorities = loadCardPriorities(storage, host);
  expect(priorities).toEqual({ session: "critical" });
  saveCardPriorities(updateCardPriority(priorities, "session", null), storage, host);
  expect(persisted).toEqual({});
  expect(loadCardPriorities(new MemoryStorage(), { kliprunCardPriorities: persisted })).toEqual({});
});
