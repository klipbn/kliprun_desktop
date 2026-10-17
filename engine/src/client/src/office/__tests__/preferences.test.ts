import { expect, test } from 'bun:test';
import { loadOfficePreferences, saveOfficePreferences } from '../preferences';

class Storage {
  value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
}

test('office choice survives a new origin through the native bridge', () => {
  let persisted: unknown;
  const host = { webkit: { messageHandlers: { officePreferences: { postMessage(value: unknown) { persisted = value; } } } } };
  const value = { layout: 'pods' as const, labels: false, links: true, animate: false };
  saveOfficePreferences(value, new Storage(), host);
  expect(loadOfficePreferences(new Storage(), { kliprunOfficePreferences: persisted })).toEqual(value);
});

test('browser choices round trip and invalid stored values recover individually', () => {
  const storage = new Storage();
  const value = { layout: 'studio' as const, labels: true, links: false, animate: true };
  saveOfficePreferences(value, storage, {});
  expect(loadOfficePreferences(storage, {})).toEqual(value);
  storage.value = JSON.stringify({ layout: 'javascript:bad', labels: 'false', links: false, animate: 0 });
  expect(loadOfficePreferences(storage, {})).toEqual({ layout: 'loft', labels: true, links: false, animate: true });
  storage.value = '{bad';
  expect(loadOfficePreferences(storage, {}).layout).toBe('loft');
  expect(loadOfficePreferences(storage, { kliprunOfficePreferences: { layout: 'pods' } }).layout).toBe('pods');
});

test('disabled browser storage does not prevent saving to the native host', () => {
  const storage = { getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); } };
  const host: { kliprunOfficePreferences?: unknown } = {};
  const value = { ...loadOfficePreferences(storage, host), layout: 'studio' as const };
  saveOfficePreferences(value, storage, host);
  expect(loadOfficePreferences(storage, host)).toEqual(value);
});
