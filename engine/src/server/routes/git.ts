import { Hono, type Context } from "hono";
import { GitError, gitAction, gitCommit, gitDiff, gitHistory, gitPath, gitRoot, gitStatus, parseGitAction } from "../git";
import { gitFile, gitFileAction, gitFileBase, gitFiles, saveGitFile } from "../gitFiles";

export function registerGitRoutes(parent: Hono) {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof GitError) return c.json({ error: error.message }, error.status);
    return c.json({ error: "Git could not read the repository. Refresh and try again." }, 409);
  });
  app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
  const root = (c: Context) => gitRoot(c.req.query("directory"));
  app.get("/repositories", async c => {
    const directories = c.req.queries("directory") ?? [];
    if (directories.length > 100) throw new GitError("Too many repository directories.", 400);
    const roots = new Set<string>();
    for (let i = 0; i < directories.length; i += 6) {
      await Promise.all(directories.slice(i, i + 6).map(async directory => { try { roots.add(await gitRoot(directory)); } catch { /* Session directories may no longer exist. */ } }));
    }
    return c.json({ repositories: [...roots].sort() });
  });
  app.get("/status", async c => c.json(await gitStatus(await root(c))));
  app.get("/files", async c => {
    const includeIgnored = c.req.query("includeIgnored");
    if (includeIgnored !== undefined && !["true", "false"].includes(includeIgnored)) throw new GitError("Invalid ignored-file visibility.", 400);
    return c.json(await gitFiles(await root(c), c.req.query("path"), { offset: Number(c.req.query("offset") ?? 0), search: c.req.query("search"), includeIgnored: includeIgnored !== "false" }));
  });
  app.get("/file", async c => c.json(await gitFile(await root(c), gitPath(c.req.query("path")))));
  app.get("/file-base", async c => c.json(await gitFileBase(await root(c), gitPath(c.req.query("path")))));
  app.post("/file-action", async c => {
    const origin = c.req.header("Origin"), site = c.req.header("Sec-Fetch-Site");
    if ((origin && origin !== new URL(c.req.url).origin) || site === "cross-site") return c.json({ error: "Cross-origin file operations are not allowed." }, 403);
    if (!c.req.header("Content-Type")?.startsWith("application/json")) return c.json({ error: "Expected JSON." }, 400);
    const raw = await c.req.text();
    if (raw.length > 16 * 1024) return c.json({ error: "File request is too large." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return c.json({ error: "Invalid JSON." }, 400); }
    if (!body || typeof body !== "object") return c.json({ error: "Invalid file request." }, 400);
    return c.json(await gitFileAction(await gitRoot(body.directory), body));
  });
  app.post("/file", async c => {
    const origin = c.req.header("Origin"), site = c.req.header("Sec-Fetch-Site");
    if ((origin && origin !== new URL(c.req.url).origin) || site === "cross-site") return c.json({ error: "Cross-origin file saves are not allowed." }, 403);
    if (!c.req.header("Content-Type")?.startsWith("application/json")) return c.json({ error: "Expected JSON." }, 400);
    const raw = await c.req.text();
    // A 40 MiB HTML report can expand when JSON escapes its contents.
    if (raw.length > 160 * 1024 * 1024) return c.json({ error: "File request is too large." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return c.json({ error: "Invalid JSON." }, 400); }
    if (!body || typeof body !== "object") return c.json({ error: "Invalid file request." }, 400);
    return c.json(await saveGitFile(await gitRoot(body.directory), gitPath(body.path), body.content, body.revision));
  });
  app.get("/history", async c => c.json(await gitHistory(await root(c), Number(c.req.query("skip") ?? 0), Number(c.req.query("limit") ?? 50))));
  app.get("/commit", async c => c.json(await gitCommit(await root(c), c.req.query("revision") ?? "")));
  app.get("/diff", async c => c.json(await gitDiff(await root(c), gitPath(c.req.query("path")), c.req.query("mode") ?? "", c.req.query("revision"))));
  app.post("/action", async c => {
    const origin = c.req.header("Origin"), site = c.req.header("Sec-Fetch-Site");
    if ((origin && origin !== new URL(c.req.url).origin) || site === "cross-site") return c.json({ error: "Cross-origin Git operations are not allowed." }, 403);
    if (!c.req.header("Content-Type")?.startsWith("application/json")) return c.json({ error: "Expected JSON." }, 400);
    const raw = await c.req.text();
    if (raw.length > 1024 * 1024) return c.json({ error: "Git request is too large." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return c.json({ error: "Invalid JSON." }, 400); }
    const action = parseGitAction(body);
    if (body.expected !== undefined && (!body.expected || typeof body.expected !== "object" ||
      (body.expected.branch !== null && (typeof body.expected.branch !== "string" || body.expected.branch.length > 256)) ||
      (body.expected.head !== null && (typeof body.expected.head !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(body.expected.head))))) throw new GitError("Invalid repository expectation.", 400);
    return c.json(await gitAction(await gitRoot(body.directory), action, body.expected));
  });
  parent.route("/api/git", app);
}
