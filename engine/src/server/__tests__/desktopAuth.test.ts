import { expect, test } from "bun:test";
import { authorizedDesktopRequest } from "../desktopAuth";

test("requires the exact bearer token", () => {
  expect(authorizedDesktopRequest("Bearer abc", "abc")).toBe(true);
  expect(authorizedDesktopRequest("Bearer ab", "abc")).toBe(false);
  expect(authorizedDesktopRequest(null, "abc")).toBe(false);
});

test("accepts the app's same-origin cookie", () => {
  expect(authorizedDesktopRequest(null, "abc", "kliprun_desktop_auth=abc")).toBe(true);
  expect(authorizedDesktopRequest(null, "abc", "kliprun_desktop_auth=ab")).toBe(false);
});
