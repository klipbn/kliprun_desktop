import { expect, test } from 'bun:test';
import type { CardPayload } from '@shared/types';
import { reconcileOfficeRoster } from '../departures';

const card = (id: string, parent_id: string | null = null) => ({ session_id: id, parent_id, title: id } as CardPayload);

test('removed agents and subagents remain in the scene until their departure completes', () => {
  const lead = card('lead'), helper = card('helper', 'lead');
  const initial = reconcileOfficeRoster(new Map(), [lead, helper], false);
  const leaving = reconcileOfficeRoster(initial, [], false);
  expect([...leaving.keys()]).toEqual(['lead', 'helper']);
  expect(leaving.get('lead')).toEqual({ card: lead, leaving: true });
  expect(leaving.get('helper')).toEqual({ card: helper, leaving: true });
  expect(reconcileOfficeRoster(leaving, [], false)).toEqual(leaving);
});

test('a returning session cancels departure and uses its latest card without duplicating it', () => {
  const initial = reconcileOfficeRoster(new Map(), [card('lead')], false);
  const leaving = reconcileOfficeRoster(initial, [], false);
  const latest = { ...card('lead'), title: 'Back at work' };
  const returned = reconcileOfficeRoster(leaving, [latest], false);
  expect(returned.size).toBe(1);
  expect(returned.get('lead')).toEqual({ card: latest, leaving: false });
});

test('reduced motion clears departures and does not bring previously departed sessions back', () => {
  const initial = reconcileOfficeRoster(new Map(), [card('lead'), card('helper', 'lead')], false);
  const quiet = reconcileOfficeRoster(initial, [card('lead')], true);
  expect([...quiet.keys()]).toEqual(['lead']);
  expect(reconcileOfficeRoster(quiet, [card('lead')], false).has('helper')).toBe(false);
});
