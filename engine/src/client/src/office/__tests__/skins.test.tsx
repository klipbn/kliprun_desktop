import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Mascot } from '../appearance';
import { KLOPIK_SKINS, klopikVariant } from '../skins';
import { desktopPreferences } from '../../nativeBridge';

test('skin selection reaches Office preferences with a safe default', () => {
  expect(desktopPreferences({ kliprunPreferences: { klopikSkin: 'wizard' } }).klopikSkin).toBe('wizard');
  expect(desktopPreferences({ kliprunPreferences: { klopikSkin: '<script>' } }).klopikSkin).toBe('default');
  expect(desktopPreferences({}).klopikSkin).toBe('default');
});

test('skin sets retain movement anchors and render distinct equipment variations', () => {
  const drawings = new Set<string>();
  for (const skin of Object.keys(KLOPIK_SKINS) as Array<keyof typeof KLOPIK_SKINS>) {
    const variants = new Set<string>();
    for (let variant = 0; variant < 4; variant++) {
      const html = renderToStaticMarkup(<Mascot skin={skin} variant={variant} raised />);
      expect(html).toContain('office-feet');
      expect(html).toContain('office-eyes');
      expect(html).toContain('office-arm-left');
      expect(html).toContain('office-raised-arm');
      const artwork = html.replace(/data-[\w-]+="[^"]*"/g, '');
      variants.add(artwork); drawings.add(artwork);
    }
    expect(variants.size).toBe(skin === 'default' ? 1 : 4);
  }
  expect(drawings.size).toBe(21);
});

test('variants are stable per session and spread consecutive agent IDs across the set', () => {
  const ids = ['ses_agent_a', 'ses_agent_b', 'ses_agent_c', 'ses_agent_d'];
  const original = ids.map(klopikVariant);
  expect(new Set(original).size).toBe(4);
  expect([...ids].reverse().map(klopikVariant).reverse()).toEqual(original);
  expect(klopikVariant('ses_agent_a')).toBe(original[0]);
});
