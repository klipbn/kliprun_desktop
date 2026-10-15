/**
 * KlipRun Bun server: single process, read-only access to the OpenCode DB.
 * Never manages `opencode serve` processes; never writes to OpenCode storage.
 */
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { DEFAULT_PORT } from "@shared/constants";
import { BoardService } from "./boardService";
import { Watcher, type CombinedEvent } from "./watcher";
import { registerBoardRoute, registerHealthRoute, registerSessionRoute, registerTerminalLinksRoute } from "./routes/api";
import { authorizedDesktopRequest } from "./desktopAuth";
import { availableLoopbackPort } from "./desktopPort";
import { closeAllSSEConnections, registerStreamRoute } from "./routes/stream";
import { checkDbExists, getDbPath } from "./storage/db";
import { StatsService, registerStatsRoutes } from "./usage/service";
import { QuotaService, registerQuotaRoutes } from "./quota";

function resolvePort(args: string[]): number {
  const flagIndex = args.indexOf("--port");
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    const parsed = Number.parseInt(args[flagIndex + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const env = process.env.KLIPRUN_BUN_PORT;
  if (env) {
    const parsed = Number.parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PORT;
}

const requestedPort = resolvePort(process.argv.slice(2));
const port = requestedPort === 0 ? await availableLoopbackPort() : requestedPort;
const token = process.env.KLIPRUN_DESKTOP_TOKEN;
if (!token) throw new Error("KLIPRUN_DESKTOP_TOKEN is required");

const app = new Hono();
app.get("/_desktop/auth", c => {
  const supplied = c.req.query("token");
  if (!supplied || !authorizedDesktopRequest(`Bearer ${supplied}`, token)) return c.json({ error: "unauthorized" }, 401);
  c.header("Set-Cookie", `kliprun_desktop_auth=${token}; HttpOnly; SameSite=Strict; Path=/`);
  c.header("Cache-Control", "no-store");
  return c.redirect("/", 302);
});
app.use("*", async (c, next) => {
  if (!authorizedDesktopRequest(c.req.header("Authorization"), token, c.req.header("Cookie"))) return c.json({ error: "unauthorized" }, 401);
  await next();
});

const statistics = new StatsService();
const service = new BoardService({ observe: observation => statistics.observe(observation) });
const watcher = new Watcher(undefined, undefined, () => service.codex.watchPaths());

registerHealthRoute(app, service);
registerBoardRoute(app, service);
registerSessionRoute(app, service);
registerTerminalLinksRoute(app, service);
registerStreamRoute(app, watcher, service);
registerStatsRoutes(app, statistics);
registerQuotaRoutes(app, new QuotaService());

app.use("*", serveStatic({ root: "./src/client/dist" }));
app.use("*", serveStatic({ path: "./src/client/dist/index.html" }));

watcher.on("change", (event: CombinedEvent) => {
  if (event.source === "hermes") service.refreshLivenessNow();
  service.invalidate();
});

watcher.start();
service.start();

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  // SSE heartbeat is every 30 s; Bun's 10 s default closes quiet streams.
  idleTimeout: 60,
  fetch: app.fetch,
});

console.log(JSON.stringify({ ready: true, port: server.port }));
console.log(`[kliprun-bun] watching db: ${getDbPath()} (exists: ${checkDbExists()})`);

async function shutdown() {
  console.log("[kliprun-bun] shutting down…");
  closeAllSSEConnections();
  watcher.stop();
  service.stop();
  await statistics.close();
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
