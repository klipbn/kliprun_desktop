// Playwright callback; run against `bun docs/screenshots/preview.ts` after building the client.
async (page) => {
  const base = "http://127.0.0.1:18796";
  await page.route(`${base}/api/session/*`, async route => {
    const response = await route.fetch();
    const detail = await response.json();
    const id = decodeURIComponent(route.request().url().split("/").at(-1));
    await route.fulfill({ json: { ...detail, session_id: id, title: `Details: ${id}` } });
  });
  await page.route(`${base}/api/board`, async route => {
    const response = await route.fetch();
    const board = await response.json();
    const card = { ...board.columns.running.cards[0], source: "codex", session_id: "codex-terminal:999",
      column: "idle", stage: "Status unknown", title: "Codex · demo", children: [],
      terminal: { pid: 999, generation: "demo", session_id: null, candidates: [] } };
    board.columns.idle.cards.push(card);
    board.columns.idle.count++;
    await route.fulfill({ json: board });
  });
  try {
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await page.locator('[data-testid="card-ses_demo_search"]').waitFor();
      const unresolved = page.locator('[data-testid="card-codex-terminal:999"]');
      await unresolved.getByText("Connecting session…", { exact: true }).waitFor();
      if (await page.getByRole("combobox", { name: "Current chat" }).count()) throw new Error("Manual chat selector is still visible");
      await page.getByRole("button", { name: "Implement search API", exact: true }).click();
      const panel = page.locator('[data-testid="details-panel"]');
      await panel.getByText("Details: ses_demo_search", { exact: true }).waitFor();
      await page.evaluate(() => {
        window.__selectionMessages = [];
        window.webkit.messageHandlers.sessionSelected.postMessage = id => window.__selectionMessages.push(id);
        window.dispatchEvent(new CustomEvent("kliprun:terminal-selection", { detail: "ses_demo_review" }));
      });
      await panel.getByText("Details: ses_demo_review", { exact: true }).waitFor({ timeout: 3000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("kliprun:terminal-selection", { detail: "ses_demo_search" })));
      await panel.getByText("Details: ses_demo_search", { exact: true }).waitFor();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("kliprun:terminal-selection", { detail: null })));
      await panel.getByText("Details: ses_demo_search", { exact: true }).waitFor();
      const messages = await page.evaluate(() => window.__selectionMessages);
      if (messages.length) throw new Error("Native terminal selection must not echo back to the dock");
    }
    return "Normal and small layouts: terminal details follow tab changes; unresolved cards have no chat selector; unresolved tabs preserve details; no native feedback loop.";
  } finally {
    await page.unroute(`${base}/api/session/*`);
    await page.unroute(`${base}/api/board`);
  }
}
