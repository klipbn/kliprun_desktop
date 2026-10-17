export const OFFICE_LAYOUTS = { loft: 'Shared loft', pods: 'Team rooms', studio: 'Long studio' } as const;
export type OfficeLayout = keyof typeof OFFICE_LAYOUTS;
export interface OfficePreferences { layout: OfficeLayout; labels: boolean; links: boolean; animate: boolean }
type OfficeHost = {
  kliprunOfficePreferences?: unknown;
  webkit?: { messageHandlers?: { officePreferences?: { postMessage(value: OfficePreferences): void } } };
};
type OfficeStorage = Pick<Storage, 'getItem' | 'setItem'>;
const key = 'kliprun.officePreferences';
function host(): OfficeHost { return typeof window === 'undefined' ? {} : window as OfficeHost; }
function storage(): OfficeStorage | null { try { return window.localStorage; } catch { return null; } }
function validate(value: unknown): OfficePreferences {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { layout: v.layout === 'pods' || v.layout === 'studio' ? v.layout : 'loft',
    labels: typeof v.labels === 'boolean' ? v.labels : true,
    links: typeof v.links === 'boolean' ? v.links : true,
    animate: typeof v.animate === 'boolean' ? v.animate : true };
}
export function loadOfficePreferences(store = storage(), native = host()): OfficePreferences {
  if (native.kliprunOfficePreferences !== undefined) return validate(native.kliprunOfficePreferences);
  try { return validate(JSON.parse(store?.getItem(key) ?? 'null')); } catch { return validate(null); }
}
export function saveOfficePreferences(value: OfficePreferences, store = storage(), native = host()): void {
  const valid = validate(value);
  try { store?.setItem(key, JSON.stringify(valid)); } catch { /* Private or full browser storage. */ }
  native.kliprunOfficePreferences = valid;
  native.webkit?.messageHandlers?.officePreferences?.postMessage(valid);
}
