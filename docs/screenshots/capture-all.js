// Playwright callback. Serve preview.ts first; all session and priority data come from mock-api.json.
async (page, directory = "docs/screenshots", base = "http://127.0.0.1:18796") => {
  const captures = [];
  const external = [];
  const watch = request => { if (!request.url().startsWith(`${base}/`)) external.push(request.url()); };
  page.on("request", watch);
  async function visit(path, width, height) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}${path}`);
    if (!path.startsWith("/__demo/")) {
      await page.locator('[data-testid="version"]').waitFor();
      if ((await page.locator('[data-testid="version"]').innerText()) !== "v0.0.24") throw new Error("Build the 0.0.24 client before capturing.");
    }
  }
  async function save(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${directory}/${name}.png`, animations: "disabled" });
    captures.push({ name, viewport: page.viewportSize() });
  }
  try {
    await visit("/", 1440, 900);
    await page.locator('[data-testid="card-ses_demo_search"]').waitFor();
    await save("kanban");
    await page.getByRole("button", { name: "Implement search API", exact: true }).click();
    await page.locator(".agent-markdown").first().waitFor();
    await save("kanban-details");
    await visit("/sessions", 1440, 900);
    await page.evaluate(async () => {
      const {sessions} = await (await fetch('/api/session-catalog')).json();
      const id = title => sessions.find(s => s.title === title).id;
      localStorage.setItem('kliprun.sessionWorkspace',JSON.stringify({version:1,
        projects:[{id:'atlas',name:'atlas',groups:[]},{id:'aurora',name:'aurora',groups:[{id:'research',name:'Research'},{id:'work',name:'Work'}]}],
        assignments:{[id('Implement search API')]:{projectId:'atlas',groupId:null},[id('Review database migration')]:{projectId:'aurora',groupId:'research'},[id('Investigate flaky tests')]:{projectId:'aurora',groupId:'research'},[id('Refine onboarding UI')]:{projectId:'aurora',groupId:'work'},[id('Draft release notes')]:{projectId:'aurora',groupId:null}},
        favorites:[id('Draft release notes')],collapsed:[],sidebarCollapsed:false}));
    });
    await page.reload(); await page.locator('.sw-row').first().waitFor();
    await save('sessions');
    await page.locator('#sw-projects button').filter({hasText:'aurora'}).click();
    await save('session-groups');
    await visit("/office", 1600, 1200);
    await page.evaluate(() => localStorage.removeItem("kliprun.officePreferences"));
    await page.reload();
    await page.locator(".office-resident").first().waitFor();
    await save("office");
    await visit("/stats?period=30&timezone=UTC&heatmap=daily", 1600, 1600);
    await page.locator(".stats-token-cell").first().waitFor();
    await save("statistics");
    await page.getByRole("button", { name: "Weekly", exact: true }).click();
    await page.locator('.stats-token-cell strong').first().waitFor();
    await save("statistics-weekly");
    await visit("/usage", 1600, 900);
    await page.locator('.usage-provider[data-provider="kimi"] .usage-balance').waitFor();
    await page.getByText("Checking providers…", { exact: true }).waitFor({ state: "hidden" });
    const providers = await page.locator(".usage-provider h2").allTextContents();
    if (providers.join("|") !== "OpenAI · OpenCode|OpenAI · Codex|Z.ai|Kimi") throw new Error(`Unexpected providers: ${providers}`);
    await save("usage");
    await visit("/", 1600, 1000);
    await page.locator('[data-testid="card-ses_demo_search"]').waitFor();
    await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    await page.locator("dialog[open]").waitFor();
    await save("shortcuts");
    await visit("/__demo/terminal-demo.html", 1440, 900);
    await page.locator(".terminal .screen").waitFor();
    await page.evaluate(async () => { const image = new Image(); image.src = "kanban-details.png"; await image.decode(); });
    await save("desktop-terminal");
    if (external.length) throw new Error(`Non-fixture requests: ${external.join(", ")}`);
    return { captures, externalRequests: external.length };
  } finally { page.off("request", watch); }
}
