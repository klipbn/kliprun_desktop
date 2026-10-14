import { timingSafeEqual } from "node:crypto";

export function authorizedDesktopRequest(header: string | null | undefined, token: string, cookie?: string | null): boolean {
  if (!token) return false;
  const cookieValue = cookie?.match(/(?:^|;\s*)kliprun_desktop_auth=([^;]*)/)?.[1];
  const value = header?.startsWith("Bearer ") ? header.slice(7) : cookieValue;
  if (!value) return false;
  const given = Buffer.from(value);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
