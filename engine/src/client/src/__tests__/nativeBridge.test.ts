import { expect, test } from "bun:test";
import { notifyNativeSelection, observeNativeNavigation, observeNativeTerminalSelection } from "../nativeBridge";

test("reports the exact selected session to the desktop shell", () => {
  const received: Array<string | null> = [];
  notifyNativeSelection("codex:abc-123", { webkit: { messageHandlers: { sessionSelected: { postMessage: value => received.push(value) } } } });
  expect(received).toEqual(["codex:abc-123"]);
});

test("reports closing the session details", () => {
  const received: Array<string | null> = [];
  notifyNativeSelection(null, { webkit: { messageHandlers: { sessionSelected: { postMessage: value => received.push(value) } } } });
  expect(received).toEqual([null]);
});

test("tracks the terminal selected by the native dock independently of details", () => {
  const host = new EventTarget();
  Object.assign(host, { kliprunTerminalSessionId: "ses_initial" });
  const selected: Array<string | null> = [];
  const stop = observeNativeTerminalSelection(id => selected.push(id), host);
  host.dispatchEvent(new CustomEvent("kliprun:terminal-selection", { detail: "codex:session-1" }));
  host.dispatchEvent(new CustomEvent("kliprun:terminal-selection", { detail: null }));
  stop();
  host.dispatchEvent(new CustomEvent("kliprun:terminal-selection", { detail: "ses_other" }));
  expect(selected).toEqual(["ses_initial", "codex:session-1", null]);
});

test("delivers pending desktop navigation once and ignores later events after cleanup", () => {
  const host = Object.assign(new EventTarget(), { kliprunPendingNavigation: "/stats" });
  const pages: string[] = [];
  const stop = observeNativeNavigation(path => pages.push(path), host);
  expect(host.kliprunPendingNavigation).toBeUndefined();
  host.dispatchEvent(new CustomEvent("kliprun:navigate", { detail: "/office" }));
  stop();
  host.dispatchEvent(new CustomEvent("kliprun:navigate", { detail: "/" }));
  expect(pages).toEqual(["/stats", "/office"]);
});
