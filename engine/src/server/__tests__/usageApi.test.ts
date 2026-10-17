import { afterEach, expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StatsService, registerStatsRoutes } from "../usage/service";
import type { OfficeUsagePayload, RecentSessionsPayload, StatsDashboardPayload, StatsSessionsPayload, StatsSessionPayload } from "@shared/usage";
import { UsageStore } from "../usage/store";

const resources: Array<{ service: StatsService; home: string }> = [];
afterEach(async () => { for (const { service, home } of resources.splice(0)) { await service.close(); rmSync(home, { recursive: true, force: true }); } });
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "kliprun-usage-api-"));
  const service = new StatsService({ path: join(home, "usage.sqlite3"), historyPath: join(home, "missing-history"), opencodePath: join(home, "missing-opencode"), codexHome: home });
  resources.push({ service, home });
  const app = new Hono(); registerStatsRoutes(app, service);
  return { service, app };
}
test("recent sessions include both harnesses, newest first, without child sessions", async () => {
  const { app } = fixture();
  await app.request("/api/stats?from=0&to=300");
  const store = new UsageStore(join(resources[resources.length - 1].home, "usage.sqlite3"));
  try {
    for (const [id, parent, at, source] of [["ses_old", null, 100, "opencode"], ["codex:01900000-0000-7000-8000-000000000001", null, 200, "codex"], ["ses_child", "ses_old", 300, "opencode"]] as const) {
      store.upsertSession({ id, parent_id: parent, source, title: id, directory: "/project", created_at: 1, updated_at: at });
    }
    const response = await app.request("/api/recent-sessions");
    expect(response.status).toBe(200);
    expect((await response.json() as { sessions: Array<{ id: string }> }).sessions.map(s => s.id)).toEqual(["codex:01900000-0000-7000-8000-000000000001", "ses_old"]);
  } finally { store.close(); }
});
test("recent history searches beyond the first page and combines source, project and updated filters", async () => {
  const { app } = fixture();
  await app.request("/api/stats?from=0&to=300");
  const store = new UsageStore(join(resources[resources.length - 1].home, "usage.sqlite3"));
  try {
    for (let index = 0; index < 65; index++) store.upsertSession({ id: `ses_recent_${index}`, parent_id: null, source: "opencode",
      title: `Recent task ${index}`, directory: "/demo/atlas", created_at: 1, updated_at: 1000 + index });
    const target = { id: "codex:01900000-0000-7000-8000-000000000001", parent_id: null, source: "codex" as const,
      title: "Проверить Поиск 100%_ready", directory: "/demo/aurora", created_at: 1, updated_at: 100 };
    store.upsertSession(target);
    store.upsertSession({ ...target, id: "ses_hidden_child", parent_id: target.id, directory: "/demo/hidden", updated_at: 9999 });
    const search = async (query: Record<string, string>) => (await (await app.request(`/api/recent-sessions?${new URLSearchParams(query)}`)).json()) as RecentSessionsPayload;
    const result = await search({ search: "ПОИСК aurora 100%_", source: "codex", project: "/demo/aurora", after: "100" });
    expect(result.sessions.map(session => session.id)).toEqual([target.id]);
    expect(result.total).toBe(1);
    expect(result.projects).toEqual(["/demo/atlas", "/demo/aurora"]);
    expect((await search({ search: "поиск", source: "opencode" })).sessions).toEqual([]);
    expect((await search({ search: "поиск", project: "/demo/atlas" })).sessions).toEqual([]);
    expect((await search({ search: "поиск", after: "101" })).sessions).toEqual([]);
    expect((await search({ project: "/demo/atlas' OR 1=1 --" })).total).toBe(0);
    const older = await search({ page: "1", limit: "50" });
    expect(older.total).toBe(66); expect(older.sessions).toHaveLength(16);
    expect(older.sessions.at(-1)?.id).toBe(target.id);
  } finally { store.close(); }
});
test("recent history rejects invalid or unbounded query parameters", async () => {
  const { app } = fixture();
  for (const query of ["source=other", "search=" + "x".repeat(201), "project=relative", "page=-1", "page=1.5", "page=1000001",
    "limit=0", "limit=101", "after=NaN", "after=-1", "search=%00", "project=%2Fdemo%00"]) {
    expect((await app.request(`/api/recent-sessions?${query}`)).status).toBe(400);
  }
});
test("worker-backed statistics serve independent observations while unavailable sources remain isolated", async () => {
  const { service, app } = fixture();
  const cards = [{ session_id: "ses_a", source: "opencode" as const, title: "Task", directory: "/p", parent_id: null, agent: "build", model: "p/a" }];
  const interval = { id: 1, session_id: "ses_a", directory: "/p", column_name: "running" as const, entered_at: 100, exited_at: null, duration_ms: null };
  service.observe({ at: 100, cards, intervals: [interval] });
  service.observe({ at: 200, cards, intervals: [interval] });
  const response = await app.request("/api/stats?from=0&to=300&timezone=UTC");
  expect(response.status).toBe(200);
  const result = await response.json() as StatsDashboardPayload;
  expect(result.summary.running_ms).toBe(100);
  expect(result.token_activity.daily).toHaveLength(1);
  expect(result.token_activity.weekly).toHaveLength(1);
  expect(result.token_activity.daily[0].tokens.total).toBe(0);
  expect(result.sources.some(s => s.state === "unavailable")).toBe(true);
  const list = await (await app.request("/api/stats/sessions?from=0&to=300&timezone=UTC")).json() as StatsSessionsPayload;
  expect(list.rows[0].id).toBe("ses_a");
  const detail = await (await app.request("/api/stats/session/ses_a?from=0&to=300&timezone=UTC")).json() as StatsSessionPayload;
  expect(detail.session!.running_ms).toBe(100);
});
test("statistics API rejects invalid dates, filters, session ids and unbounded pagination", async () => {
  const { app } = fixture();
  for (const url of ["/api/stats?from=2&to=1", "/api/stats?timezone=Nope", "/api/stats?source=bad", "/api/stats/sessions?page=-1", "/api/stats/sessions?limit=9999", "/api/stats/sessions?sort=bad", "/api/stats/session/bad"]) {
    expect((await app.request(url)).status).toBe(400);
  }
});
test("a terminated worker immediately fails later requests without hanging shutdown", async () => {
  const { service, app } = fixture();
  await app.request("/api/stats?from=0&to=300");
  // Fault injection uses the actual worker, not a fake RPC response.
  const worker = (service as unknown as { worker: Worker }).worker;
  const ended = new Promise<void>(resolve => worker.addEventListener("close", () => resolve(), { once: true }));
  worker.terminate(); await ended;
  const response = await Promise.race([
    app.request("/api/stats?from=0&to=300"),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("worker failure hung a new request")), 1000)),
  ]);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Statistics temporarily unavailable" });
  await service.close();
});

test("office usage returns each requested session's own accumulated tokens exactly once", async () => {
  const { app } = fixture();
  const store = new UsageStore(join(resources[resources.length - 1].home, "usage.sqlite3"));
  try {
    for (const [id, parent, amount] of [["ses_parent", null, 120], ["ses_child", "ses_parent", 900], ["ses_foreign", null, 9999]] as const) {
      store.upsertSession({ id, parent_id: parent, source: "opencode", title: id, directory: "/p", created_at: 1, updated_at: 1 });
      store.upsertEvents(id, [{ id: "usage", session_id: id, at: null, kind: "usage", agent: "build", model: "p/m",
        tokens: { total: amount, input: amount, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, other: 0 }, cost: null, incomplete: false }]);
    }
    store.upsertEvents("ses_parent", [{ id: "second-call", session_id: "ses_parent", at: 2, kind: "usage", agent: "build", model: "p/m",
      tokens: { total: 80, input: 80, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, other: 0 }, cost: null, incomplete: false }]);
    const response = await app.request("/api/stats/office-usage?session=ses_parent&session=ses_child&session=ses_parent&session=ses_missing");
    expect(response.status).toBe(200);
    const payload = await response.json() as OfficeUsagePayload;
    expect(payload.rows.map(row => [row.session_id, row.tokens])).toEqual([
      ["ses_parent", 200], ["ses_child", 900], ["ses_missing", null],
    ]);
    expect(payload.rows.find(row => row.session_id === "ses_missing")!.incomplete).toBe(true);
  } finally { store.close(); }
});

test("office usage rejects malformed IDs and unbounded batches", async () => {
  const { app } = fixture();
  for (const query of ["", "session=bad", Array.from({ length: 51 }, (_, i) => `session=ses_${i}`).join("&")]) {
    expect((await app.request(`/api/stats/office-usage?${query}`)).status).toBe(400);
  }
});
