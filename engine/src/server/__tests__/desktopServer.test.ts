import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { availableLoopbackPort } from "../desktopPort";

const packagedRoot = join(process.cwd(), "../dist/KlipRun.app/Contents/Resources/engine");
const variants = [{ name: "source", root: process.cwd(), binary: process.execPath }];
if (existsSync(packagedRoot)) variants.push({ name: "packaged", root: packagedRoot, binary: join(packagedRoot, "../../MacOS/bun") });

for (const { name, root, binary } of variants) test(`${name} desktop server requires its token and serves the live board`, async () => {
  const home = mkdtempSync(join(tmpdir(), "kliprun-desktop-test-"));
  const port = await availableLoopbackPort();
  const child = Bun.spawn([binary, "run", "src/server/index.ts", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, KLIPRUN_DESKTOP_TOKEN: "testtoken", KLIPRUN_BUN_HOME: home,
      KLIPRUN_BUN_DB: join(home, "missing.db"), KLIPRUN_BUN_CODEX_HOME: join(home, "missing-codex"),
      CODEX_HERMES_BASE_DIR: join(home, "missing-hermes") },
    stdout: "pipe", stderr: "pipe",
  });
  try {
    const url = `http://127.0.0.1:${port}/api/board`;
    let response: Response | undefined;
    for (let i = 0; i < 80; i++) {
      try { response = await fetch(url, { signal: AbortSignal.timeout(500) }); break; } catch { await Bun.sleep(100); }
    }
    if (!response) {
      child.kill(); await child.exited;
      throw new Error(`Server did not start (exit ${child.exitCode}): stdout=${await new Response(child.stdout).text()} stderr=${await new Response(child.stderr).text()}`);
    }
    expect(response?.status).toBe(401);
    const quotaURL = `http://127.0.0.1:${port}/api/quota/codex`;
    expect((await fetch(quotaURL)).status).toBe(401);
    const quota = await fetch(quotaURL, { headers: { Authorization: "Bearer testtoken" } });
    expect(quota.headers.get("content-type")).toContain("application/json");
    expect(await quota.json()).toMatchObject({ provider: "codex", status: "not_configured", limits: [] });
    const board = await fetch(url, { headers: { Authorization: "Bearer testtoken" } });
    expect(board.status).toBe(200);
    expect((await board.json() as { columns: unknown }).columns).toBeDefined();
    const links = await fetch(`http://127.0.0.1:${port}/api/terminal-links`, { headers: { Authorization: "Bearer testtoken" } });
    expect(links.status).toBe(200);
    const stats = await fetch(`http://127.0.0.1:${port}/api/stats?from=1&to=2&timezone=UTC&period=custom`, { headers: { Authorization: "Bearer testtoken" } });
    expect(stats.status).toBe(200);
    const statsPayload = await stats.json() as { summary: unknown; token_activity: { daily: unknown[]; weekly: unknown[] } };
    expect(statsPayload.summary).toBeDefined();
    expect(statsPayload.token_activity.daily).toHaveLength(1);
    expect(statsPayload.token_activity.weekly).toHaveLength(1);
    const login = await fetch(`http://127.0.0.1:${port}/_desktop/auth?token=testtoken`, { redirect: "manual" });
    expect(login.status).toBe(302);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBe("kliprun_desktop_auth=testtoken");
    const webBoard = await fetch(url, { headers: { Cookie: cookie! } });
    expect(webBoard.status).toBe(200);
    const homepage = await fetch(`http://127.0.0.1:${port}/`, { headers: { Cookie: cookie! } });
    expect(homepage.status).toBe(200);
    const html = await homepage.text();
    expect(html).toContain("<div id=\"root\">");
    const cssPath = html.match(/href="([^"]+\.css)"/)?.[1];
    expect(cssPath).toBeDefined();
    const stylesheet = await fetch(`http://127.0.0.1:${port}${cssPath}`, { headers: { Cookie: cookie! } });
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers.get("content-type")).toContain("text/css");
  } finally {
    child.kill(); await child.exited;
    rmSync(home, { recursive: true, force: true });
  }
}, 15_000);
