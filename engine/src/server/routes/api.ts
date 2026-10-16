import type { Hono } from "hono";
import type { BoardService } from "../boardService";

export function registerBoardRoute(app: Hono, service: BoardService) {
  app.get("/api/board", (c) => {
    const ifNoneMatch = c.req.header("If-None-Match");
    const result = service.getBoard(ifNoneMatch);
    if (result.notModified) {
      return c.body(null, 304, { ETag: result.etag, "Cache-Control": "no-cache" });
    }
    c.header("ETag", result.etag);
    c.header("Cache-Control", "no-cache");
    return c.json(result.data);
  });
}

export function registerSessionRoute(app: Hono, service: BoardService) {
  app.get("/api/session/:id", (c) => {
    const id = c.req.param("id");
    if (!/^ses_[a-zA-Z0-9_-]+$/.test(id) && !/^codex:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      return c.json({ error: "invalid session id" }, 400);
    }
    return c.json(service.getSessionDetail(id));
  });
}

export function registerHealthRoute(app: Hono, service: BoardService) {
  app.get("/api/health", (c) => {
    return c.json({
      ok: true,
      tui_directories: service.tuiCount(),
      codex_diagnostics: service.codexDiagnostics(),
      uptime_s: Math.floor((Date.now() - service.startedAt) / 1000),
    });
  });
}

export function registerTerminalLinksRoute(app: Hono, service: BoardService) {
  app.get("/api/terminal-links", c => c.json({ links: service.terminalLinks() }));
  app.post("/api/codex/terminal-session", async c => {
    const body = await c.req.json().catch(() => null);
    if (!body || !Number.isSafeInteger(body.pid) || body.pid <= 0 || typeof body.generation !== "string" || body.generation.length > 128 ||
      (body.session_id !== null && (typeof body.session_id !== "string" || !/^codex:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.session_id)))) {
      return c.json({ error: "Invalid terminal session selection" }, 400);
    }
    if (!service.selectCodexTerminalSession(body.pid, body.session_id, body.generation)) {
      return c.json({ error: "Terminal or session changed; refresh the board and try again" }, 409);
    }
    return c.json({ ok: true });
  });
}
