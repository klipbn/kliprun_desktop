import { useEffect, useState } from "react";
import { desktopPreferences, observeNativePreferences } from "../nativeBridge";

export function useDesktopPreferences() {
  const [preferences, setPreferences] = useState(() => desktopPreferences());
  useEffect(() => observeNativePreferences(setPreferences), []);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.style.colorScheme = preferences.theme === "daybreak" || preferences.theme === "paper" ? "light" : "dark";
  }, [preferences.theme]);
  return preferences;
}
