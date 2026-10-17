// Uses only the fictional screenshot dataset served by the local preview.
async (page) => {
  const context = await page.context().browser().newContext(); page = await context.newPage();
  const base = "http://127.0.0.1:18796", errors = [], requests = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => requests.push(request.url()));
  try {
    await page.goto(`${base}/stats?from=0&period=all`);
    const latest = page.getByRole("region", { name: "Latest sessions", exact: true });
    await latest.waitFor({ timeout: 10000 });
    await latest.locator("tbody tr").first().waitFor();
    const limit = latest.getByRole("combobox", { name: "Number of latest sessions" });
    assert(await limit.inputValue() === "10", "Default session count is not 10");
    for (const value of ["5", "20", "50"]) {
      const response = page.waitForResponse(r => r.url().includes(`sort=recent&page=1&limit=${value}`));
      await limit.selectOption(value); const payload = await (await response).json();
      await page.waitForFunction(n => document.querySelectorAll('#stats-latest tbody tr').length === n, payload.rows.length);
      assert(payload.rows.length <= Number(value), "Latest sessions exceeds the selected limit");
      const names = await latest.locator(".stats-task-title").allTextContents();
      assert(names.join("|") === payload.rows.map(row => row.title || "Untitled").join("|"), "Latest-session order differs from the API");
      assert(payload.rows.every((row, i) => i === 0 || row.last_at <= payload.rows[i - 1].last_at), "Latest sessions are not newest first");
    }
    await page.reload(); await latest.locator("tbody tr").first().waitFor();
    assert(await limit.inputValue() === "50", "Session count was not saved");
    assert(await latest.getByRole("columnheader", { name: "Cached input", exact: true }).count() === 1, "Cached input is mislabeled");
    const first = latest.locator(".stats-task-name").first(), name = await first.locator(".stats-task-title").innerText();
    await first.click(); await page.getByRole("dialog").getByRole("heading", { name, exact: true }).waitFor();
    await page.getByRole("button", { name: "Close task statistics", exact: true }).click();
    for (const size of [{ width: 1440, height: 900 }, { width: 500, height: 700 }]) {
      await page.setViewportSize(size);
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "Latest sessions overflows the window");
      const before = await latest.evaluate(element => !!(element.compareDocumentPosition(document.querySelector('#stats-token-activity')) & Node.DOCUMENT_POSITION_FOLLOWING));
      assert(before, "Latest sessions must precede Token activity and Token mix");
    }
    await page.route(`${base}/api/stats/sessions?**sort=recent**`, route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
    await limit.selectOption("10"); await latest.getByRole("alert").waitFor();
    assert(await latest.locator("tbody tr").count() === 0, "Count changes retained stale rows after a failed request");
    await page.unroute(`${base}/api/stats/sessions?**sort=recent**`);
    await page.route(`${base}/api/stats/sessions?**sort=recent**`, route => route.fulfill({ json: { rows: [], total: 0, page: 1, limit: 5 } }));
    await limit.selectOption("5"); await latest.getByText("No sessions match the selected period and filters.", { exact: true }).waitFor();
    assert(!errors.length && requests.every(url => url.startsWith(base)), `Browser errors or external requests: ${errors.join("; ")}`);
    return { limits: [5, 10, 20, 50], order: true, persistence: true, detail: true, smallLayout: true, failureAndEmpty: true };
  } finally { await context.close(); }
}
