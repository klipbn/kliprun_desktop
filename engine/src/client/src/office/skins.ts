export const KLOPIK_SKINS = { default: 'Default', robot: 'Robot', astronaut: 'Astronaut', knight: 'Knight', wizard: 'Wizard', explorer: 'Explorer' } as const;
export type KlopikSkin = keyof typeof KLOPIK_SKINS;
export function validateKlopikSkin(value: unknown): KlopikSkin {
  return typeof value === 'string' && Object.hasOwn(KLOPIK_SKINS, value) ? value as KlopikSkin : 'default';
}
/** Session identity, not position, status or time, determines its equipment. */
export function klopikVariant(sessionId: string): number {
  let hash = 0;
  for (const char of sessionId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 4;
}
