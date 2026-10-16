import { expect, test } from "bun:test";
import { exportStatisticsCSV, notifyNativeSelection, observeNativeNavigation, observeNativeTerminalSelection, observeNativePreferences, observeNativeUpdate } from "../nativeBridge";

test("update availability arrives initially and live and stops after cleanup", () => {
  const host = Object.assign(new EventTarget(), { kliprunUpdateVersion: "0.0.10" as unknown });
  const versions: Array<string | null> = [];
  const stop = observeNativeUpdate(version => versions.push(version), host);
  host.kliprunUpdateVersion = "0.0.11";
  host.dispatchEvent(new Event("kliprun:update"));
  host.kliprunUpdateVersion = null;
  host.dispatchEvent(new Event("kliprun:update"));
  host.kliprunUpdateVersion = 42;
  host.dispatchEvent(new Event("kliprun:update"));
  stop();
  host.kliprunUpdateVersion = "0.0.12";
  host.dispatchEvent(new Event("kliprun:update"));
  expect(versions).toEqual(["0.0.10", "0.0.11", null, null]);
});

test("desktop preferences are delivered initially and live, with validated defaults and cleanup", () => {
  const host = Object.assign(new EventTarget(), { kliprunPreferences: { detailTab: "all", reduceMotion: true } });
  const values: unknown[] = [];
  const stop = observeNativePreferences(value => values.push(value), host);
  host.kliprunPreferences = { detailTab: "agent", reduceMotion: false };
  host.dispatchEvent(new Event("kliprun:preferences"));
  host.kliprunPreferences = { detailTab: "unexpected", reduceMotion: false };
  host.dispatchEvent(new Event("kliprun:preferences"));
  stop();
  host.dispatchEvent(new Event("kliprun:preferences"));
  expect(values).toEqual([
    { detailTab: "agent-text", reduceMotion: true }, { detailTab: "agent", reduceMotion: false },
    { detailTab: "agent-text", reduceMotion: false },
  ]);
});

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

test("CSV export sends exact contents to the native save dialog and falls back in a browser", () => {
  const received: unknown[] = [];
  const content = "date,total\r\n2026-10-15,1234567\r\n";
  expect(exportStatisticsCSV("kliprun-tokens-demo.csv", content, { webkit: { messageHandlers: {
    exportStatistics: { postMessage: value => received.push(value) },
  } } })).toBe(true);
  expect(received).toEqual([{ filename: "kliprun-tokens-demo.csv", content }]);
  expect(exportStatisticsCSV("kliprun-tokens-demo.csv", content, {})).toBe(false);
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
import { observeNativeRepository, gitRepository, saveGitRepository } from "../nativeBridge";

test("repository picker publishes only absolute directory selections and unsubscribes", () => {
  const host = new EventTarget(), received: string[] = [];
  const stop = observeNativeRepository(path => received.push(path), host);
  host.dispatchEvent(new CustomEvent("kliprun:repository", { detail: "/demo/project" }));
  host.dispatchEvent(new CustomEvent("kliprun:repository", { detail: null }));
  host.dispatchEvent(new CustomEvent("kliprun:repository", { detail: "relative/path" }));
  stop(); host.dispatchEvent(new CustomEvent("kliprun:repository", { detail: "/other" }));
  expect(received).toEqual(["/demo/project"]);
});

test("repository selection validates paths, prefers native preferences and persists through the bridge", () => {
  const values: string[] = [];
  const host = { kliprunGitRepository: "/native/project" as unknown,
    localStorage: { getItem: () => "/stale/project", setItem: (_key: string, value: string) => values.push(`stored:${value}`) },
    webkit: { messageHandlers: { gitRepository: { postMessage: (value: string) => values.push(`native:${value}`) } } } };
  expect(gitRepository(host)).toBe("/native/project");
  saveGitRepository("/new/project", host); expect(gitRepository(host)).toBe("/new/project");
  saveGitRepository("relative", host);
  expect(values).toEqual(["stored:/new/project", "native:/new/project"]);
});
