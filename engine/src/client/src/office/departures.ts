import type { CardPayload } from '@shared/types';

export interface OfficeResident { card: CardPayload; leaving: boolean }

/** Keep the last observed appearance only while its character walks out. */
export function reconcileOfficeRoster(previous: Map<string, OfficeResident>, live: CardPayload[], quiet: boolean): Map<string, OfficeResident> {
  const next = new Map(live.map(card => [card.session_id, { card, leaving: false }]));
  if (!quiet) for (const [id, resident] of previous) {
    if (!next.has(id)) next.set(id, { card: resident.card, leaving: true });
  }
  return next;
}
