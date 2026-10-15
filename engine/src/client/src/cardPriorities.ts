export type CardPriority = "critical" | "medium" | "low";
export type CardPriorities = Record<string, CardPriority>;

export const CARD_PRIORITIES_STORAGE_KEY = "kliprun.cardPriorities";

type PriorityHost = {
  kliprunCardPriorities?: unknown;
  webkit?: { messageHandlers?: { cardPriorities?: { postMessage: (value: CardPriorities) => void } } };
};

function browserHost(): PriorityHost { return typeof window === "undefined" ? {} : window as PriorityHost; }

function validated(value: unknown): CardPriorities {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, CardPriority] =>
    entry[1] === "critical" || entry[1] === "medium" || entry[1] === "low"));
}

type PriorityStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): PriorityStorage | null {
  try { return window.localStorage; } catch { return null; }
}

export function loadCardPriorities(storage = browserStorage(), host = browserHost()): CardPriorities {
  if (host.kliprunCardPriorities !== undefined) return validated(host.kliprunCardPriorities);
  try { return validated(JSON.parse(storage?.getItem(CARD_PRIORITIES_STORAGE_KEY) ?? "null")); }
  catch { return {}; }
}

export function updateCardPriority(priorities: CardPriorities, sessionId: string, priority: CardPriority | null): CardPriorities {
  const next = { ...priorities };
  if (priority) next[sessionId] = priority;
  else delete next[sessionId];
  return next;
}

export function saveCardPriorities(priorities: CardPriorities, storage = browserStorage(), host = browserHost()): void {
  try { storage?.setItem(CARD_PRIORITIES_STORAGE_KEY, JSON.stringify(priorities)); } catch { /* Storage may be unavailable or full. */ }
  host.kliprunCardPriorities = priorities;
  host.webkit?.messageHandlers?.cardPriorities?.postMessage(priorities);
}
