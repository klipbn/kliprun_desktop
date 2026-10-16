import type { ColumnKey } from "@shared/types";

export type CardOrder = Record<ColumnKey, string[]>;
const KEY = "kliprun.cardOrder";
type OrderHost = {
  kliprunCardOrder?: unknown;
  webkit?: { messageHandlers?: { cardOrder?: { postMessage: (value: CardOrder) => void } } };
};

export function validateCardOrder(value: unknown): CardOrder {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const ids = (key: ColumnKey) => Array.isArray(object[key])
    ? [...new Set((object[key] as unknown[]).filter((id): id is string => typeof id === "string"))] : [];
  return { attention: ids("attention"), running: ids("running"), idle: ids("idle") };
}

export function orderedCards<T extends { session_id: string }>(cards: T[], order: string[]): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...cards].sort((a,b) => (positions.get(a.session_id) ?? Infinity) - (positions.get(b.session_id) ?? Infinity));
}

export function moveCard(ids: string[], from: string, to: string): string[] {
  const start = ids.indexOf(from), end = ids.indexOf(to);
  if (start < 0 || end < 0 || start === end) return ids;
  const next = [...ids];
  next.splice(start, 1);
  next.splice(end, 0, from);
  return next;
}

export function loadCardOrder(): CardOrder {
  const host = window as OrderHost;
  if (host.kliprunCardOrder !== undefined) return validateCardOrder(host.kliprunCardOrder);
  try { return validateCardOrder(JSON.parse(localStorage.getItem(KEY) ?? "null")); }
  catch { return validateCardOrder(null); }
}

export function saveCardOrder(order: CardOrder): void {
  const host = window as OrderHost;
  try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* Storage unavailable. */ }
  host.kliprunCardOrder = order;
  host.webkit?.messageHandlers?.cardOrder?.postMessage(order);
}
