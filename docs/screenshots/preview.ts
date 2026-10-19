import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboard, buildSessionDetail, rankSessions } from "../../engine/src/server/usage/aggregate.ts";
import { buildSessionCatalog } from "../../engine/src/server/usage/catalog.ts";
import { parseStatsFilters } from "../../engine/src/server/usage/time.ts";
import { UsageStore } from "../../engine/src/server/usage/store.ts";
import { parseRecentSessionsQuery } from "../../engine/src/server/usage/recent.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = await Bun.file(join(root, "docs/screenshots/mock-api.json")).json();
const recent = new UsageStore(":memory:");
for (const session of fixture.recent_sessions.sessions) recent.upsertSession(session);
const build = join(root, "engine/src/client/dist");
const requests: string[] = [];
const clock = `<script>const OriginalDate = Date; window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [${fixture.board.generated_at}])); } static now() { return ${fixture.board.generated_at}; } }; window.kliprunCardPriorities = ${JSON.stringify(fixture.card_priorities)}; window.kliprunPreferences = { detailTab: "agent-text", reduceMotion: true }; window.webkit = { messageHandlers: { desktopAction: {postMessage(){}}, sessionSelected: {postMessage(){}} } };</script>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.KLIPRUN_PREVIEW_PORT ?? 18796), idleTimeout: 0, async fetch(request) {
  const url = new URL(request.url), path = url.pathname;
  if (path === "/__preview/requests") return Response.json(requests);
  if (path === "/__preview/git-diff-examples") return Response.json(fixture.git.diff_examples);
  if (path.startsWith("/api/")) requests.push(path+url.search);
  if (path === "/api/git/repositories") return Response.json({ repositories: fixture.git.repositories });
  if (path === "/api/git/status") return Response.json({ ...fixture.git.status, root: url.searchParams.get("directory") ?? fixture.git.status.root });
  if (path === "/api/git/files") {
    const prefix = url.searchParams.get("path"), ignored = Object.keys(fixture.git.ignored_files ?? {});
    const names = [...Object.keys(fixture.git.text_files), ...ignored].filter(name => !prefix || name.startsWith(`${prefix}/`));
    const files = prefix ? names.filter(name => !name.slice(prefix.length + 1).includes("/")) : names.filter(name => !ignored.includes(name) || !name.includes("/"));
    const directories = [...new Set(names.filter(name => ignored.includes(name) && name.slice(prefix ? prefix.length + 1 : 0).includes("/")).map(name => `${prefix ? `${prefix}/` : ""}${name.slice(prefix ? prefix.length + 1 : 0).split("/")[0]}`))];
    return Response.json({ root: url.searchParams.get("directory"), files, directories, ignored: [...files.filter(name => ignored.includes(name)), ...directories], truncated: false });
  }
  if (path === "/api/git/file-base") {
    const name = url.searchParams.get("path") ?? "";
    return Response.json(Object.hasOwn(fixture.git.ignored_files ?? {}, name) ? { content: null, notice: "Ignored by Git" } : { content: fixture.git.file_baselines?.[name] ?? fixture.git.text_files[name] ?? "" });
  }
  if (path === "/api/git/file") {
    if (request.method !== "GET") return Response.json({ error: "Fixture preview: files are not modified." }, { status: 409 });
    const name = url.searchParams.get("path") ?? "", content = fixture.git.text_files[name] ?? fixture.git.ignored_files?.[name];
    return content === undefined ? Response.json({ error: "Unknown demo file." }, { status: 404 })
      : Response.json({ root: url.searchParams.get("directory"), path: name, content, revision: "demo-revision-1" });
  }
  if (path === "/api/git/history") return Response.json(fixture.git.history);
  if (path === "/api/git/commit") return Response.json(fixture.git.commits[url.searchParams.get("revision") ?? ""] ?? { error: "Unknown demo commit" });
  if (path === "/api/git/diff") return Response.json(fixture.git.diffs[url.searchParams.get("path") ?? ""] ?? { patch: "", binary: false, truncated: false });
  if (path === "/api/git/action") return Response.json({ error: "Fixture preview: repositories are not modified." }, { status: 409 });
  if (path === "/api/session-catalog") {
    const catalog = buildSessionCatalog(fixture.statistics_dataset);
    const byId = new Map(catalog.sessions.map(s => [s.id, s]));
    return Response.json({ observed_at: catalog.observed_at, sessions: fixture.recent_sessions.sessions.map(s => ({ ...s, running_ms: byId.get(s.id)?.running_ms ?? null, top_model: byId.get(s.id)?.top_model ?? null, top_model_ms: byId.get(s.id)?.top_model_ms ?? null })) });
  }
  if (path === "/api/board") return Response.json(fixture.board);
  if (path === "/api/recent-sessions") {
    try { return Response.json(recent.recentSessions(parseRecentSessionsQuery(url))); }
    catch { return Response.json({ error: "Invalid session history filters" }, { status: 400 }); }
  }
  if (path === "/api/stats") return Response.json(buildDashboard(fixture.statistics_dataset, parseStatsFilters(url, fixture.board.generated_at), fixture.board.generated_at));
  if (path === "/api/stats/sessions") return Response.json(rankSessions(fixture.statistics_dataset, parseStatsFilters(url, fixture.board.generated_at), url.searchParams.get("sort") ?? "tokens", Number(url.searchParams.get("page") ?? 1), Number(url.searchParams.get("limit") ?? 50)));
  if (path.startsWith("/api/stats/session/")) return Response.json(buildSessionDetail(fixture.statistics_dataset, parseStatsFilters(url, fixture.board.generated_at), decodeURIComponent(path.split("/").at(-1)!)));
  if (path === "/api/stats/office-usage") return Response.json(fixture.office_usage);
  if (path.startsWith("/api/quota/")) return Response.json(fixture.quotas[path.split("/").at(-1)!]);
  if (path.startsWith("/api/session/")) return Response.json(fixture.details);
  if (path === "/api/stream") return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(": preview\n\n")); } }), {headers:{"Content-Type":"text/event-stream"}});
  if (path.startsWith("/__demo/")) {
    const name = path.slice("/__demo/".length);
    if (!["terminal-demo.html", "kanban-details.png"].includes(name)) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(join(root, "docs/screenshots", name)));
  }
  const file = Bun.file(join(build, path));
  if (path !== "/" && await file.exists()) return new Response(file);
  return new Response((await Bun.file(join(build, "index.html")).text()).replace("<head>", `<head>${clock}`), {headers:{"Content-Type":"text/html"}});
}});
console.log(`Fixture-only preview: ${server.url}`);
