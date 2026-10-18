import { expect, test } from "bun:test";
import { hasDesktopBridge, notifyNativeAction } from "../nativeBridge";

test("desktop controls send only a named action to the native shell", () => {
  const received: string[] = [];
  const host = { webkit: { messageHandlers: { desktopAction: { postMessage: (value: string) => received.push(value) } } } };
  expect(hasDesktopBridge(host)).toBe(true);
  notifyNativeAction("new-opencode", host);
  notifyNativeAction("new-codex", host);
  notifyNativeAction("new-claude", host);
  notifyNativeAction("settings", host);
  notifyNativeAction("check-updates", host);
  expect(received).toEqual(["new-opencode", "new-codex", "new-claude", "settings", "check-updates"]);
});
