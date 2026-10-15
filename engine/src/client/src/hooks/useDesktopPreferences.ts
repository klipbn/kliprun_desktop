import { useEffect, useState } from "react";
import { desktopPreferences, observeNativePreferences } from "../nativeBridge";

export function useDesktopPreferences() {
  const [preferences, setPreferences] = useState(() => desktopPreferences());
  useEffect(() => observeNativePreferences(setPreferences), []);
  return preferences;
}
