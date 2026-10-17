import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { gitRequest } from "../git/useGitRequest";

const fetchMock = spyOn(globalThis, "fetch");
afterEach(() => fetchMock.mockReset());
afterAll(() => fetchMock.mockRestore());

test("Git requests bypass HTTP caches while keeping request headers and bodies", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"action":"stage"}' };
  expect(await gitRequest<{ ok: boolean }>("/api/git/action", init)).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledWith("/api/git/action", { ...init, cache: "no-store" });
});
test("an HTML fallback gives a recovery message instead of a browser JSON parse error", async () => {
  fetchMock.mockResolvedValueOnce(new Response("<!doctype html><html>Application page</html>", { headers: { "Content-Type": "text/html" } }));
  await expect(gitRequest("/api/git/status?directory=/demo")).rejects.toThrow(/Restart KlipRun/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("a truncated JSON response can be retried without losing the real Git error", async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"root":', { headers: { "Content-Type": "application/json" } }));
  await expect(gitRequest("/api/git/status?directory=/demo")).rejects.toThrow(/Refresh the repository/);
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Repository HEAD changed. Refresh and try again." }, { status: 409 }));
  await expect(gitRequest("/api/git/action", { method: "POST" })).rejects.toThrow("Repository HEAD changed. Refresh and try again.");
});
test("a failed response without an error object keeps its HTTP status", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(null, { status: 503 }));
  await expect(gitRequest("/api/git/status?directory=/demo")).rejects.toThrow(/503/);
});
test("an oversized HTTP request reports the server rejection instead of suggesting an app restart", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 431 }));
  await expect(gitRequest("/api/git/repositories")).rejects.toThrow(/431/);
});
