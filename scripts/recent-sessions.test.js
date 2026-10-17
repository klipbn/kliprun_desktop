// Playwright callback against the fixture-only preview; native actions are recorded, not executed.
async (page) => {
  const browser = await page.context().browser().browserType().launch({ headless: true });
  const context = await browser.newContext(); page = await context.newPage();
  page.setDefaultTimeout(5000);
  const base = "http://127.0.0.1:18796";
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const seed = await (await page.request.get(`${base}/api/recent-sessions`)).json();
  const archived = { ...seed.sessions.find(session => session.source === "opencode"), id: "ses_demo_archive", title: "Archived project review",
    directory: "/Users/demo/Projects/aurora" };
  let olderPage = false;
  const errors = [], external = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (!request.url().startsWith(`${base}/`)) external.push(request.url()); });
  await page.route(`${base}/api/recent-sessions*`, async route => {
    requests.push(route.request().url());
    if (olderPage && /[?&]page=1(?:&|$)/.test(route.request().url())) return route.fulfill({ json: { ...seed, sessions: [archived], total: 51, page: 1, limit: 50 } });
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: olderPage ? { ...data, total: 51 } : data });
  });
  async function waitForRows(count) {
    await page.waitForFunction(value => document.querySelectorAll('.recent-session-row').length === value
      && document.querySelector('[aria-label="Recent sessions"]')?.getAttribute('aria-busy') !== "true", count);
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base);
    await page.evaluate(() => {
      window.__recentResumes = [];
      window.webkit.messageHandlers.sessionResume = { postMessage: id => window.__recentResumes.push(id) };
    });
    const panel = page.getByRole("complementary", { name: "Recent sessions", exact: true });
    const search = panel.getByRole("searchbox", { name: "Search sessions", exact: true });
    await search.fill("search atlas"); await waitForRows(1);
    assert((await panel.innerText()).includes("Implement search API"), "Search did not combine title and project words");
    await panel.getByRole("button", { name: "Clear search", exact: true }).click(); await waitForRows(seed.sessions.length);
    await panel.getByRole("button", { name: "Filter sessions", exact: true }).click();
    await panel.getByRole("button", { name: "Session agent", exact: true }).click();
    await panel.getByRole("option", { name: "Codex", exact: true }).click();
    await waitForRows(seed.sessions.filter(session => session.source === "codex").length);
    await panel.getByRole("button", { name: "Session project", exact: true }).click();
    await panel.getByRole("searchbox", { name: "Search projects", exact: true }).fill("atlas");
    await panel.getByRole("option", { name: "atlas /Users/demo/Projects/atlas", exact: true }).click();
    await waitForRows(seed.sessions.filter(session => session.source === "codex" && session.directory.endsWith("/atlas")).length);
    await panel.getByRole("button", { name: "Updated period", exact: true }).click();
    await panel.getByRole("option", { name: "Today", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Recent sessions"]')?.getAttribute('aria-busy') !== "true");
    assert(requests.some(url => /[?&]after=\d+/.test(url)), "Period filtering did not reach the history query");
    await search.fill("no matching session"); await waitForRows(0);
    await panel.getByText("No matching sessions", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Clear search and filters", exact: true }).click(); await waitForRows(seed.sessions.length);
    await search.fill("search"); await waitForRows(1);
    await panel.getByRole("button", { name: "Hide recent sessions", exact: true }).click();
    await panel.getByRole("button", { name: "Show recent sessions", exact: true }).click();
    assert(await search.inputValue() === "search", "Collapsing the sidebar lost its search");
    await waitForRows(1);
    const resume = panel.getByRole("button", { name: "Resume in OpenCode: Implement search API", exact: true });
    await resume.click();
    assert((await page.evaluate(() => window.__recentResumes)).at(-1) === "ses_demo_search", "Resume targeted another session");
    await panel.getByRole("button", { name: "Clear search", exact: true }).click(); await waitForRows(seed.sessions.length);
    for (const width of [1440, 900, 500]) {
      await page.setViewportSize({ width, height: 800 });
      const dimensions = await panel.evaluate(element => ({ width: element.getBoundingClientRect().width,
        rowHeight: element.querySelector('.recent-session-row').getBoundingClientRect().height,
        overflow: element.scrollWidth > element.clientWidth }));
      assert(dimensions.width <= 208 && dimensions.rowHeight <= 64 && !dimensions.overflow, `History is not compact at ${width}px: ${JSON.stringify(dimensions)}`);
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "History overflowed the window");
    }
    olderPage = true; await page.setViewportSize({ width: 1440, height: 900 }); await page.reload(); await waitForRows(seed.sessions.length);
    await page.evaluate(() => { window.__recentSelections = []; window.webkit.messageHandlers.sessionSelected.postMessage = id => window.__recentSelections.push(id); });
    await panel.getByRole("button", { name: "Next sessions", exact: true }).click(); await waitForRows(1);
    await page.waitForTimeout(350);
    assert(await panel.getByRole("button", { name: "Open session: Archived project review", exact: true }).count() === 1, "Pagination reset after the search debounce settled");
    await panel.getByRole("button", { name: "Open session: Archived project review", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Open session: Archived project review"]')?.getAttribute("aria-pressed") === "true");
    assert((await page.evaluate(() => window.__recentSelections)).at(-1) === archived.id, "Selecting an older row opened another session");
    await panel.getByRole("button", { name: "Previous sessions", exact: true }).click(); await waitForRows(seed.sessions.length);
    await page.getByTestId("git-button").click();
    await page.waitForFunction(() => document.querySelector('select[aria-label="Repository"]')?.value === "/Users/demo/Projects/aurora");
    assert(!errors.length && !external.length, `Browser errors or external requests: ${errors.join("; ")}, ${external.length}`);
    return { search: true, combinedFilters: true, period: true, collapse: true, resume: true, paginationAndGit: true, layouts: 3 };
  } finally { await browser.close(); }
}
