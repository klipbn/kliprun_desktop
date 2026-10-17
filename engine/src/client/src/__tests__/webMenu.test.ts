import { expect, test } from 'bun:test';
import { isWebMenuCommand } from '../webMenu';

test('native menu bridge accepts supported actions and rejects arbitrary commands', () => {
  expect(isWebMenuCommand('save-file')).toBe(true);
  expect(isWebMenuCommand('find-session')).toBe(true);
  expect(isWebMenuCommand('delete-all')).toBe(false);
  expect(isWebMenuCommand({ action: 'save-file' })).toBe(false);
});
