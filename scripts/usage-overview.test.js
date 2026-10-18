// Playwright callback; every API response comes from mock-api.json or an in-memory override.
async (page, base = "http://127.0.0.1:18826") => {
  const context = await page.context().browser().newContext();
  page = await context.newPage(); page.setDefaultTimeout(5000);
  const errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (!request.url().startsWith(`${base}/`)) external.push(request.url()); });
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const root = page.getByTestId("usage-screen");
  try {
    await page.goto(`${base}/usage`);
    await page.getByRole("heading", { name: "Token activity", exact: true }).waitFor();
    await page.locator('[data-testid="usage-total-tokens"]').waitFor();
    check(await page.locator(".usage-provider").count() === 5, "The overview lost a subscription provider");
    check(await page.locator('.usage-provider[data-provider="claude"]').getByRole("meter", { name: "5-hour: 72.5% remaining", exact: true }).count() === 1, "Claude limits changed");
    await Promise.all([page.waitForResponse(response => response.url().includes("/api/stats?") && /[?&]period=30(?:&|$)/.test(response.url())), page.getByRole("button", { name: "Last 30 days", exact: true }).click()]);
    const [filtered] = await Promise.all([page.waitForResponse(response => response.url().includes("/api/stats?") && /[?&]source=codex(?:&|$)/.test(response.url())), page.getByLabel("Token history source", { exact: true }).selectOption("codex")]);
    const data = await filtered.json();
    await page.waitForFunction(total => document.querySelector('[data-testid="usage-total-tokens"]')?.getAttribute("title") === new Intl.NumberFormat("en-US").format(total), data.summary.tokens.total);
    await page.getByRole("button", { name: /^Cached input / }).click();
    check(await page.getByLabel("Token chart metric", { exact: true }).inputValue() === "cache_read", "Token composition does not control the trend");
    await page.getByLabel("Token chart metric", { exact: true }).selectOption("total");
    for (const width of [1800, 1440, 980, 720, 500, 380, 320]) {
      await page.setViewportSize({ width, height: 760 });
      check(await root.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Usage overflows at ${width}px`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflows at ${width}px`);
      const cards = await page.locator(".usage-provider").evaluateAll(elements => elements.map(e => ({ w: e.clientWidth, scroll: e.scrollWidth })));
      check(cards.every(card => card.scroll <= card.w + 1), `A provider card clips its contents at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await root.evaluate(element => { element.style.width = "420px"; element.style.flex = "none"; });
    check(await root.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "Usage uses viewport width instead of the available pane width");
    check(await page.locator(".usage-provider").first().evaluate(element => element.getBoundingClientRect().width < 420), "Provider cards ignore a narrow pane");
    await root.evaluate(element => { element.style.width = ""; element.style.flex = ""; });
    const task = page.locator(".usage-task-open").first();
    await task.click(); await page.getByRole("dialog", { name: /.+/ }).waitFor(); await page.locator(".stats-detail-kpis").waitFor();
    await page.getByRole("button", { name: "Close task statistics", exact: true }).click();
    const model = page.locator('.usage-breakdown[aria-label="Top models"] a').first();
    const modelHref = await model.getAttribute("href");
    const expectedModel = await page.evaluate(href => new URL(href, location.origin).searchParams.get("model"), modelHref);
    await model.click(); await page.getByRole("heading", { name: "Statistics", exact: true }).waitFor();
    check(await page.evaluate(() => new URLSearchParams(location.search).get("model")) === expectedModel, "Model drilldown lost its filter");
    check(await page.evaluate(() => new URLSearchParams(location.search).get("source")) === "codex", "Model drilldown lost the source filter");
    await page.goBack(); await page.getByTestId("usage-total-tokens").waitFor();
    check(await page.getByRole("button", { name: "Last 30 days", exact: true }).getAttribute("aria-pressed") === "true", "Back lost the usage period");
    await page.evaluate(() => { window.kliprunPreferences = { theme: "paper", reduceMotion: true }; window.dispatchEvent(new Event("kliprun:preferences")); });
    check(await page.locator(".usage-limit-heading > span").first().evaluate(element => getComputedStyle(element).color !== "rgb(255, 255, 255)"), "Limit labels disappear in the light theme");
    await page.route(`${base}/api/stats?*`, route => route.fulfill({ status: 503, json: { error: "Statistics temporarily unavailable" } }));
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.getByText(/Unable to load statistics/).waitFor();
    check(await page.locator(".usage-provider").count() === 5, "A history error hid subscription limits");
    await page.unroute(`${base}/api/stats?*`);
    await page.getByRole("button", { name: "Retry token history", exact: true }).click();
    await page.getByTestId("usage-total-tokens").waitFor();
    check(!errors.length && !external.length, `Browser errors or external requests: ${errors.join("; ")}; ${external.length}`);
    return { limits: 5, tokenPeriod: true, sourceFilters: true, compositionControl: true, modelDrilldown: true, taskDetails: true, responsiveLayouts: 7, constrainedPane: true, lightTheme: true, errorRecovery: true };
  } finally { await context.close(); }
}
