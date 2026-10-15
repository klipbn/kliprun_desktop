import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboard, buildSessionDetail, rankSessions } from "../../engine/src/server/usage/aggregate.ts";
import { parseStatsFilters } from "../../engine/src/server/usage/time.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = await Bun.file(join(root, "docs/screenshots/mock-api.json")).json();
const build = join(root, "engine/src/client/dist");
const requests: string[] = [];
const clock = `<script>const OriginalDate = Date; window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [${fixture.board.generated_at}])); } static now() { return ${fixture.board.generated_at}; } }; window.kliprunCardPriorities = ${JSON.stringify(fixture.card_priorities)}; window.kliprunPreferences = { detailTab: "agent-text", reduceMotion: true }; window.webkit = { messageHandlers: { desktopAction: {postMessage(){}}, sessionSelected: {postMessage(){}} } };</script>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 18796, idleTimeout: 0, async fetch(request) {
  const url = new URL(request.url), path = url.pathname;
  if (path === "/__preview/requests") return Response.json(requests);
  if (path.startsWith("/api/")) requests.push(path+url.search);
  if (path === "/api/board") return Response.json(fixture.board);
  if (path === "/api/recent-sessions") return Response.json(fixture.recent_sessions);
  if (path === "/api/stats") return Response.json(buildDashboard(fixture.statistics_dataset, parseStatsFilters(url, fixture.board.generated_at), fixture.board.generated_at));
  if (path === "/api/stats/sessions") return Response.json(rankSessions(fixture.statistics_dataset, parseStatsFilters(url, fixture.board.generated_at), url.searchParams.get("sort") ?? "tokens", Number(url.searchParams.get("page") ?? 1), 50));
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
